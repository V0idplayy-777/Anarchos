import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  PASSWORD_MIN,
  PASSWORD_MAX,
  SESSION_TTL_MS,
  badRequest,
  conflict,
  normalizeUsername,
  publicUser,
  requireUser,
  validateUsername,
} from "./lib/auth";

const LOCK_THRESHOLD = 6;
const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;

export const checkThrottle = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("authAttempts")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) return { locked: false, remainingMs: 0 };
    const now = Date.now();
    if (row.lockedUntil && row.lockedUntil > now) {
      return { locked: true, remainingMs: row.lockedUntil - now };
    }
    return { locked: false, remainingMs: 0 };
  },
});

export const recordFailure = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("authAttempts")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) {
      await ctx.db.insert("authAttempts", { key, count: 1, lastAttemptAt: now });
      return;
    }
    const count = now - row.lastAttemptAt > WINDOW_MS ? 1 : row.count + 1;
    await ctx.db.patch(row._id, {
      count,
      lastAttemptAt: now,
      lockedUntil: count >= LOCK_THRESHOLD ? now + LOCK_MS : undefined,
    });
  },
});

export const clearFailures = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("authAttempts")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

/**
 * Resolves a session token to its user from inside a Node action, where
 * `ctx.db` is unavailable. Kept internal: it returns the password hash so
 * changePassword can verify the current credential server-side.
 */
export const sessionUser = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireUser(ctx, token);
    return { _id: user._id, username: user.username, passwordHash: user.passwordHash };
  },
});

export const usernameTaken = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    return Boolean(existing);
  },
});

export const lookupByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    return (
      (await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", username))
        .unique()) ?? null
    );
  },
});

/** Creates the user document. Re-checks uniqueness inside the transaction. */
export const createUser = internalMutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, { username, passwordHash, displayName }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (existing) throw conflict("That username is already taken.");
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      username,
      passwordHash,
      displayName,
      searchName: displayName ? displayName.toLowerCase() : undefined,
      followerCount: 0,
      followingCount: 0,
      videoCount: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const user = await ctx.db.get(userId);
    return publicUser(user);
  },
});

export const createSession = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, { userId, token, userAgent }) => {
    const now = Date.now();
    await ctx.db.insert("sessions", {
      token,
      userId,
      userAgent,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
  },
});

/** Restores a session on page load. Throws when the token is no longer valid. */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireUser(ctx, token);
    let avatarUrl = null;
    if (user.avatarStorageId) {
      try {
        avatarUrl = await ctx.storage.getUrl(user.avatarStorageId);
      } catch {
        avatarUrl = null;
      }
    }
    return { ...publicUser(user), avatarUrl };
  },
});

export const usernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const normalized = normalizeUsername(username);
    const error = validateUsername(normalized);
    if (error) return { available: false, error };
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
    if (existing) return { available: false, error: "That username is already taken." };
    return { available: true, error: null };
  },
});

export const logOut = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (session) await ctx.db.delete(session._id);
    return { ok: true };
  },
});

export const logOutEverywhere = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireUser(ctx, token);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const session of sessions) {
      if (session.token !== token) await ctx.db.delete(session._id);
    }
    return { ok: true };
  },
});


/** Patches the password and revokes every other session for the account. */
export const applyPasswordChange = internalMutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
    keepToken: v.string(),
  },
  handler: async (ctx, { userId, passwordHash, keepToken }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw badRequest("Account not found.");
    await ctx.db.patch(userId, { passwordHash, updatedAt: Date.now() });
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      if (session.token !== keepToken) await ctx.db.delete(session._id);
    }
    return { ok: true };
  },
});

export const passwordLimits = query({
  args: {},
  handler: async () => ({ min: PASSWORD_MIN, max: PASSWORD_MAX }),
});
