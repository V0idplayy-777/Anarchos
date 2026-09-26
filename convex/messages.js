import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  MESSAGE_MAX,
  areFriends,
  badRequest,
  forbidden,
  notFound,
  publicUser,
  requireText,
  requireUser,
} from "./lib/auth";

function pairFor(aId, bId) {
  return aId < bId ? { userA: aId, userB: bId } : { userA: bId, userB: aId };
}

async function hydrateConversation(ctx, conversation, viewerId) {
  const otherId = conversation.userA === viewerId ? conversation.userB : conversation.userA;
  const other = await ctx.db.get(otherId);
  const mutual = await areFriends(ctx, viewerId, otherId);
  let avatarUrl = null;
  if (other?.avatarStorageId) {
    try {
      avatarUrl = await ctx.storage.getUrl(other.avatarStorageId);
    } catch {
      avatarUrl = null;
    }
  }
  return {
    _id: conversation._id,
    lastMessageAt: conversation.lastMessageAt,
    lastMessageText: conversation.lastMessageText ?? "",
    lastMessageFromViewer: conversation.lastMessageSenderId === viewerId,
    isFriend: mutual,
    other: other
      ? { ...publicUser(other), avatarUrl }
      : { _id: otherId, username: "deleted", displayName: "Deleted account", avatarUrl: null },
  };
}

async function participantOrThrow(ctx, conversationId, userId) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw notFound("That conversation no longer exists.");
  if (conversation.userA !== userId && conversation.userB !== userId) {
    // IDOR guard: non-participants can never read or write this thread.
    throw forbidden("You are not a participant in this conversation.");
  }
  return conversation;
}

/**
 * Conversation list. Both sides of the participant pair are merged here, which
 * uses two indexed lookups instead of a table scan.
 */
export const listConversations = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const viewer = await requireUser(ctx, token);
    const [asA, asB] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_userA", (q) => q.eq("userA", viewer._id))
        .order("desc")
        .take(100),
      ctx.db
        .query("conversations")
        .withIndex("by_userB", (q) => q.eq("userB", viewer._id))
        .order("desc")
        .take(100),
    ]);
    const merged = [...asA, ...asB].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    const hydrated = [];
    for (const conversation of merged) {
      hydrated.push(await hydrateConversation(ctx, conversation, viewer._id));
    }
    return { conversations: hydrated };
  },
});

/**
 * Opens (or reuses) the thread with another user. Messaging requires a mutual
 * follow, and this is re-verified on every message send as well.
 */
export const openConversation = mutation({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, { token, userId }) => {
    const viewer = await requireUser(ctx, token);
    if (viewer._id === userId) throw badRequest("You cannot message yourself.");
    const target = await ctx.db.get(userId);
    if (!target || target.status !== "active") throw notFound("This account no longer exists.");
    if (!(await areFriends(ctx, viewer._id, userId))) {
      throw forbidden("You can only message people who follow you back.");
    }
    const { userA, userB } = pairFor(viewer._id, userId);
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_participants", (q) => q.eq("userA", userA).eq("userB", userB))
      .unique();
    if (existing) {
      return { conversation: await hydrateConversation(ctx, existing, viewer._id) };
    }
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      userA,
      userB,
      lastMessageAt: now,
      createdAt: now,
    });
    const created = await ctx.db.get(conversationId);
    return { conversation: await hydrateConversation(ctx, created, viewer._id) };
  },
});

/** Conversation header/authorization state, kept separate from the message page. */
export const getConversation = query({
  args: { token: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, { token, conversationId }) => {
    const viewer = await requireUser(ctx, token);
    const conversation = await participantOrThrow(ctx, conversationId, viewer._id);
    return await hydrateConversation(ctx, conversation, viewer._id);
  },
});

/**
 * Newest-first page of messages. The client reverses the accumulated pages so
 * the thread reads oldest to newest.
 */
export const listMessages = query({
  args: {
    paginationOpts: paginationOptsValidator,
    token: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { paginationOpts, token, conversationId }) => {
    const viewer = await requireUser(ctx, token);
    await participantOrThrow(ctx, conversationId, viewer._id);
    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) => q.eq("conversationId", conversationId))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...page,
      page: page.page.map((message) => ({
        _id: message._id,
        text: message.text,
        senderId: message.senderId,
        mine: message.senderId === viewer._id,
        createdAt: message.createdAt,
      })),
    };
  },
});

export const sendMessage = mutation({
  args: { token: v.string(), conversationId: v.id("conversations"), text: v.string() },
  handler: async (ctx, { token, conversationId, text }) => {
    const viewer = await requireUser(ctx, token);
    const conversation = await participantOrThrow(ctx, conversationId, viewer._id);
    const parsed = requireText(text, MESSAGE_MAX, "Message");
    if (parsed.error) throw badRequest(parsed.error);

    // Authorization is re-checked at send time, never trusted from the client.
    const otherId =
      conversation.userA === viewer._id ? conversation.userB : conversation.userA;
    if (!(await areFriends(ctx, viewer._id, otherId))) {
      throw forbidden("You can only message people who follow you back.");
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId,
      senderId: viewer._id,
      text: parsed.text,
      status: "visible",
      createdAt: now,
    });
    await ctx.db.patch(conversationId, {
      lastMessageAt: now,
      lastMessageText: parsed.text.slice(0, 140),
      lastMessageSenderId: viewer._id,
    });
    return { messageId, createdAt: now };
  },
});

export const deleteMessage = mutation({
  args: { token: v.string(), messageId: v.id("messages") },
  handler: async (ctx, { token, messageId }) => {
    const viewer = await requireUser(ctx, token);
    const message = await ctx.db.get(messageId);
    if (!message) throw notFound("That message no longer exists.");
    if (message.senderId !== viewer._id) {
      throw forbidden("You can only delete messages you sent.");
    }
    await participantOrThrow(ctx, message.conversationId, viewer._id);
    await ctx.db.delete(messageId);
    return { ok: true };
  },
});

export const conversationCounts = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const viewer = await requireUser(ctx, token);
    const [asA, asB] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_userA", (q) => q.eq("userA", viewer._id))
        .order("desc")
        .take(200),
      ctx.db
        .query("conversations")
        .withIndex("by_userB", (q) => q.eq("userB", viewer._id))
        .order("desc")
        .take(200),
    ]);
    return { total: asA.length + asB.length };
  },
});
