import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  MAX_IMAGE_BYTES,
  badRequest,
  conflict,
  normalizeUsername,
  notFound,
  optionalText,
  publicUser,
  requireUser,
  validateUsername,
} from "./lib/auth";

async function followFlags(ctx, viewerId, userIds) {
  const map = {};
  if (!viewerId) return map;
  for (const id of userIds) {
    if (!id || id === viewerId) continue;
    const row = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", viewerId).eq("followingId", id)
      )
      .unique();
    if (row) map[id] = true;
  }
  return map;
}

/** Resolves follow edges into public profiles with the viewer's follow state. */
async function hydratePeople(ctx, edges, field, viewer) {
  const users = (
    await Promise.all(edges.map(async (edge) => await ctx.db.get(edge[field])))
  ).filter((user) => user && user.status === "active");
  const following = await followFlags(ctx, viewer?._id, users.map((user) => user._id));
  const hydrated = [];
  for (const user of users) {
    let avatarUrl = null;
    if (user.avatarStorageId) {
      try {
        avatarUrl = await ctx.storage.getUrl(user.avatarStorageId);
      } catch {
        avatarUrl = null;
      }
    }
    hydrated.push({
      ...publicUser(user),
      avatarUrl,
      isFollowing: Boolean(following[user._id]),
    });
  }
  return hydrated;
}

export const getByUsername = query({
  args: { username: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, { username, token }) => {
    const normalized = normalizeUsername(username);
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
    if (!user || user.status !== "active") {
      throw notFound("This profile does not exist.");
    }
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    let relationship = { isSelf: false, isFollowing: false, followsViewer: false, isFriend: false };
    if (viewer) {
      const forward = await ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) =>
          q.eq("followerId", viewer._id).eq("followingId", user._id)
        )
        .unique();
      const backward = await ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) =>
          q.eq("followerId", user._id).eq("followingId", viewer._id)
        )
        .unique();
      relationship = {
        isSelf: viewer._id === user._id,
        isFollowing: Boolean(forward),
        followsViewer: Boolean(backward),
        isFriend: Boolean(forward && backward),
      };
    }
    let avatarUrl = null;
    if (user.avatarStorageId) {
      try {
        avatarUrl = await ctx.storage.getUrl(user.avatarStorageId);
      } catch {
        avatarUrl = null;
      }
    }
    return { user: { ...publicUser(user), avatarUrl }, relationship };
  },
});

/**
 * Prefix search over indexed username and display-name fields.
 * Never scans the whole users table.
 */
export const search = query({
  args: { query: v.string(), token: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { query: raw, token, limit }) => {
    const term = normalizeUsername(raw).slice(0, 40);
    if (term.length === 0) return { users: [], term: "" };
    const max = Math.min(Math.max(limit ?? 20, 1), 30);
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;

    const upperBound = term + "\uffff";
    const [byUsername, byName] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.gte("username", term).lt("username", upperBound))
        .take(max),
      ctx.db
        .query("users")
        .withIndex("by_search_name", (q) => q.gte("searchName", term).lt("searchName", upperBound))
        .take(max),
    ]);

    const seen = new Map();
    for (const user of [...byUsername, ...byName]) {
      if (!user || user.status !== "active") continue;
      if (!seen.has(user._id)) seen.set(user._id, user);
    }
    const ranked = [...seen.values()].sort((a, b) => {
      const aExact = a.username === term ? 0 : a.username.startsWith(term) ? 1 : 2;
      const bExact = b.username === term ? 0 : b.username.startsWith(term) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
      return a.username.localeCompare(b.username);
    });
    const page = ranked.slice(0, max);
    const following = await followFlags(ctx, viewer?._id, page.map((u) => u._id));
    const users = [];
    for (const user of page) {
      let avatarUrl = null;
      if (user.avatarStorageId) {
        try {
          avatarUrl = await ctx.storage.getUrl(user.avatarStorageId);
        } catch {
          avatarUrl = null;
        }
      }
      users.push({
        ...publicUser(user),
        avatarUrl,
        isFollowing: Boolean(following[user._id]),
      });
    }
    return { term, users };
  },
});

/** Suggested creators — People you might like based on mutual follows and engagement */
export const suggestedCreators = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    const viewer = await requireUser(ctx, token);
    const max = Math.min(Math.max(limit ?? 10, 1), 20);

    // Get who viewer follows
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) => q.eq("followerId", viewer._id))
      .collect();
    const followingIds = new Set(following.map((f) => f.followingId));
    followingIds.add(viewer._id); // exclude self

    // Collect candidates: people followed by people you follow (mutual follows)
    const candidateScores = new Map(); // userId -> score

    for (const follow of following.slice(0, 50)) {
      // Who do the people you follow follow?
      const theirFollowing = await ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) => q.eq("followerId", follow.followingId))
        .take(30);
      for (const tf of theirFollowing) {
        if (followingIds.has(tf.followingId)) continue;
        const current = candidateScores.get(tf.followingId) ?? 0;
        candidateScores.set(tf.followingId, current + 2); // mutual follow weight
      }
      // Also get their followers who might be popular
      const theirFollowers = await ctx.db
        .query("follows")
        .withIndex("by_following_follower", (q) => q.eq("followingId", follow.followingId))
        .take(20);
      for (const tf of theirFollowers) {
        if (followingIds.has(tf.followerId)) continue;
        const current = candidateScores.get(tf.followerId) ?? 0;
        candidateScores.set(tf.followerId, current + 1);
      }
    }

    // If not enough candidates, fill with popular creators (most followers)
    if (candidateScores.size < max) {
      const allUsers = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(100);
      for (const u of allUsers) {
        if (followingIds.has(u._id)) continue;
        if (candidateScores.has(u._id)) continue;
        // Score by followerCount + videoCount
        const score = (u.followerCount ?? 0) * 0.1 + (u.videoCount ?? 0) * 0.5;
        if (score > 0) candidateScores.set(u._id, (candidateScores.get(u._id) ?? 0) + score * 0.1);
      }
    }

    // Sort by score
    const sorted = [...candidateScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([id]) => id);

    const users = [];
    for (const id of sorted) {
      const user = await ctx.db.get(id);
      if (!user || user.status !== "active") continue;
      let avatarUrl = null;
      if (user.avatarStorageId) {
        try {
          avatarUrl = await ctx.storage.getUrl(user.avatarStorageId);
        } catch {
          avatarUrl = null;
        }
      }
      const score = candidateScores.get(id) ?? 0;
      // Reason
      let reason = "Popular on Anarchos";
      if (score >= 4) reason = "Followed by people you follow";
      else if (score >= 2) reason = "Mutual connections";
      users.push({
        ...publicUser(user),
        avatarUrl,
        isFollowing: false,
        reason,
        mutualScore: Math.round(score),
      });
    }

    return { users };
  },
});

export const listFollowers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    userId: v.id("users"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, userId, token }) => {
    const target = await ctx.db.get(userId);
    if (!target || target.status !== "active") throw notFound("This profile does not exist.");
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    const page = await ctx.db
      .query("follows")
      .withIndex("by_following_follower", (q) => q.eq("followingId", userId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...page, page: await hydratePeople(ctx, page.page, "followerId", viewer) };
  },
});

export const listFollowing = query({
  args: {
    paginationOpts: paginationOptsValidator,
    userId: v.id("users"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, userId, token }) => {
    const target = await ctx.db.get(userId);
    if (!target || target.status !== "active") throw notFound("This profile does not exist.");
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    const page = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) => q.eq("followerId", userId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...page, page: await hydratePeople(ctx, page.page, "followingId", viewer) };
  },
});

export const updateProfile = mutation({
  args: {
    token: v.string(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, { token, username, displayName, bio }) => {
    const user = await requireUser(ctx, token);
    const patch = { updatedAt: Date.now() };

    if (username !== undefined) {
      const normalized = normalizeUsername(username);
      if (normalized !== user.username) {
        const error = validateUsername(normalized);
        if (error) throw badRequest(error);
        const existing = await ctx.db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", normalized))
          .unique();
        if (existing) throw conflict("That username is already taken.");
        patch.username = normalized;
      }
    }
    if (displayName !== undefined) {
      const name = optionalText(displayName, DISPLAY_NAME_MAX, "Display name");
      if (name.error) throw badRequest(name.error);
      patch.displayName = name.value;
      patch.searchName = name.value ? name.value.toLowerCase() : undefined;
    }
    if (bio !== undefined) {
      const cleaned = optionalText(bio, BIO_MAX, "Bio");
      if (cleaned.error) throw badRequest(cleaned.error);
      patch.bio = cleaned.value;
    }
    await ctx.db.patch(user._id, patch);
    return { user: publicUser(await ctx.db.get(user._id)) };
  },
});

/** Issues a short-lived Convex storage upload URL for a profile picture. */
export const generateAvatarUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireUser(ctx, token);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setAvatar = mutation({
  args: { token: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { token, storageId }) => {
    const user = await requireUser(ctx, token);
    // Never trust the browser's declared type: read it back from storage.
    let metadata;
    try {
      metadata = await ctx.storage.getMetadata(storageId);
    } catch {
      throw badRequest("That upload could not be found. Try again.");
    }
    const contentType = metadata?.contentType ?? "";
    const size = metadata?.size ?? 0;
    if (!contentType.startsWith("image/")) {
      await ctx.storage.delete(storageId);
      throw badRequest("Profile pictures must be image files.");
    }
    if (size > MAX_IMAGE_BYTES) {
      await ctx.storage.delete(storageId);
      throw badRequest("Profile pictures must be 8 MB or smaller.");
    }
    const previous = user.avatarStorageId;
    await ctx.db.patch(user._id, { avatarStorageId: storageId, updatedAt: Date.now() });
    if (previous && previous !== storageId) {
      try {
        await ctx.storage.delete(previous);
      } catch {
        /* previous file already gone */
      }
    }
    return { avatarStorageId: storageId };
  },
});

export const removeAvatar = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireUser(ctx, token);
    const previous = user.avatarStorageId;
    await ctx.db.patch(user._id, { avatarStorageId: undefined, updatedAt: Date.now() });
    if (previous) {
      try {
        await ctx.storage.delete(previous);
      } catch {
        /* ignore */
      }
    }
    return { ok: true };
  },
});

/**
 * Permanently deletes the account and everything it owns in a single
 * transaction: videos + stored files, likes, comments, follow edges,
 * conversations, messages and sessions. Counters on other users are adjusted so
 * no other profile is left inconsistent.
 */
export const deleteAccount = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireUser(ctx, token);
    const userId = user._id;

    const myVideos = await ctx.db
      .query("videos")
      .withIndex("by_author_created", (q) => q.eq("authorId", userId))
      .collect();
    for (const video of myVideos) {
      for (const like of await ctx.db
        .query("likes")
        .withIndex("by_video_user", (q) => q.eq("videoId", video._id))
        .collect()) {
        await ctx.db.delete(like._id);
      }
      for (const comment of await ctx.db
        .query("comments")
        .withIndex("by_video_status_created", (q) => q.eq("videoId", video._id))
        .collect()) {
        for (const cl of await ctx.db
          .query("commentLikes")
          .withIndex("by_comment_user", (q) => q.eq("commentId", comment._id))
          .collect()) {
          await ctx.db.delete(cl._id);
        }
        await ctx.db.delete(comment._id);
      }
      for (const view of await ctx.db
        .query("videoViews")
        .withIndex("by_video_created", (q) => q.eq("videoId", video._id))
        .collect()) {
        await ctx.db.delete(view._id);
      }
      await ctx.db.delete(video._id);
      try {
        await ctx.storage.delete(video.storageId);
      } catch {
        /* file already removed */
      }
      if (video.thumbnailStorageId) {
        try {
          await ctx.storage.delete(video.thumbnailStorageId);
        } catch {
          /* file already removed */
        }
      }
      if (video.captionFileStorageId) {
        try {
          await ctx.storage.delete(video.captionFileStorageId);
        } catch {}
      }
    }

    // Likes this account left on other people's videos.
    const myLikes = await ctx.db
      .query("likes")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();
    for (const like of myLikes) {
      const video = await ctx.db.get(like.videoId);
      if (video) {
        await ctx.db.patch(video._id, {
          likeCount: Math.max(0, video.likeCount - 1),
        });
      }
      await ctx.db.delete(like._id);
    }

    // Comment likes
    const myCommentLikes = await ctx.db
      .query("commentLikes")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();
    for (const cl of myCommentLikes) {
      const comment = await ctx.db.get(cl.commentId);
      if (comment) {
        await ctx.db.patch(comment._id, { likeCount: Math.max(0, (comment.likeCount ?? 1) - 1) });
      }
      await ctx.db.delete(cl._id);
    }

    // Comments this account left on other people's videos.
    const myComments = await ctx.db
      .query("comments")
      .withIndex("by_author_created", (q) => q.eq("authorId", userId))
      .collect();
    for (const comment of myComments) {
      const video = await ctx.db.get(comment.videoId);
      if (video) {
        await ctx.db.patch(video._id, {
          commentCount: Math.max(0, video.commentCount - 1),
        });
      }
      await ctx.db.delete(comment._id);
    }

    // Video views
    for (const view of await ctx.db
      .query("videoViews")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(view._id);
    }

    // Follow edges in both directions.
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) => q.eq("followerId", userId))
      .collect();
    for (const edge of following) {
      const other = await ctx.db.get(edge.followingId);
      if (other) {
        await ctx.db.patch(other._id, { followerCount: Math.max(0, other.followerCount - 1) });
      }
      await ctx.db.delete(edge._id);
    }
    const followers = await ctx.db
      .query("follows")
      .withIndex("by_following_follower", (q) => q.eq("followingId", userId))
      .collect();
    for (const edge of followers) {
      const other = await ctx.db.get(edge.followerId);
      if (other) {
        await ctx.db.patch(other._id, { followingCount: Math.max(0, other.followingCount - 1) });
      }
      await ctx.db.delete(edge._id);
    }

    // Conversations and every message in them.
    const conversations = [
      ...(await ctx.db
        .query("conversations")
        .withIndex("by_userA", (q) => q.eq("userA", userId))
        .collect()),
      ...(await ctx.db
        .query("conversations")
        .withIndex("by_userB", (q) => q.eq("userB", userId))
        .collect()),
    ];
    for (const conversation of conversations) {
      for (const message of await ctx.db
        .query("messages")
        .withIndex("by_conversation_created", (q) => q.eq("conversationId", conversation._id))
        .collect()) {
        await ctx.db.delete(message._id);
      }
      await ctx.db.delete(conversation._id);
    }

    for (const session of await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(session._id);
    }

    if (user.avatarStorageId) {
      try {
        await ctx.storage.delete(user.avatarStorageId);
      } catch {
        /* ignore */
      }
    }
    await ctx.db.delete(userId);
    return { ok: true };
  },
});
