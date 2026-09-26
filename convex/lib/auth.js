import { ConvexError } from "convex/values";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 777;
export const DISPLAY_NAME_MAX = 40;
export const BIO_MAX = 400;
export const TITLE_MAX = 100;
export const CAPTION_MAX = 800;
export const COMMENT_MAX = 500;
export const MESSAGE_MAX = 2000;
/** 100 MB upload ceiling — validated server side against stored metadata. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const USERNAME_RE = /^[a-z0-9_|-]+$/;

export function normalizeUsername(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

/** Returns an error string, or null when the username is acceptable. */
export function validateUsername(raw) {
  const username = normalizeUsername(raw);
  if (!username) return "Username is required.";
  if (username.length < USERNAME_MIN)
    return `Username must be at least ${USERNAME_MIN} characters.`;
  if (username.length > USERNAME_MAX)
    return `Username must be ${USERNAME_MAX} characters or fewer.`;
  if (!USERNAME_RE.test(username))
    return "Username may only contain letters, numbers, underscores, hyphens and pipes.";
  if (/^[-_|]/.test(username) || /[-_|]$/.test(username))
    return "Username must start and end with a letter or number.";
  return null;
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length === 0)
    return "Password is required.";
  if (password.length < PASSWORD_MIN)
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX)
    return `Password must be ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

/** Normalizes optional user-supplied text. Returns { value } or { error }. */
export function optionalText(value, max, label) {
  if (value === undefined || value === null) return { value: undefined };
  const text = String(value).trim();
  if (text.length === 0) return { value: undefined };
  if (text.length > max) return { error: `${label} must be ${max} characters or fewer.` };
  return { value: text };
}

export function requireText(value, max, label) {
  if (typeof value !== "string" || value.trim().length === 0)
    return { error: `${label} is required.` };
  const text = value.trim();
  if (text.length > max) return { error: `${label} must be ${max} characters or fewer.` };
  return { text };
}

export function publicUser(user) {
  if (!user) return null;
  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName ?? "",
    bio: user.bio ?? "",
    avatarStorageId: user.avatarStorageId ?? null,
    followerCount: user.followerCount ?? 0,
    followingCount: user.followingCount ?? 0,
    videoCount: user.videoCount ?? 0,
    createdAt: user.createdAt,
  };
}

export function privateUser(user) {
  return { ...publicUser(user), emailless: true };
}

function unauthorized(message) {
  return new ConvexError({ code: "UNAUTHENTICATED", message });
}

export function badRequest(message) {
  return new ConvexError({ code: "BAD_REQUEST", message });
}

export function forbidden(message) {
  return new ConvexError({ code: "FORBIDDEN", message });
}

export function notFound(message) {
  return new ConvexError({ code: "NOT_FOUND", message });
}

export function conflict(message) {
  return new ConvexError({ code: "CONFLICT", message });
}

export function rateLimited(message) {
  return new ConvexError({ code: "RATE_LIMITED", message });
}

/**
 * Resolves the authenticated user from an opaque session token.
 * The token is the only identity input we accept — callers can never claim to
 * be another user, because the user id is always derived here.
 */
export async function requireUser(ctx, token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) {
    throw unauthorized("You need to be signed in to do that.");
  }
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!session) throw unauthorized("Your session is invalid. Please sign in again.");
  if (session.expiresAt < Date.now()) {
    await ctx.db.delete(session._id);
    throw unauthorized("Your session has expired. Please sign in again.");
  }
  const user = await ctx.db.get(session.userId);
  if (!user || user.status !== "active") {
    await ctx.db.delete(session._id);
    throw unauthorized("This account is no longer available.");
  }
  return user;
}

export async function optionalUser(ctx, token) {
  if (typeof token !== "string" || token.length === 0) return null;
  try {
    return await requireUser(ctx, token);
  } catch {
    return null;
  }
}

/** Two users are friends only when they follow each other. */
export async function areFriends(ctx, aId, bId) {
  if (!aId || !bId || aId === bId) return false;
  const [forward, backward] = await Promise.all([
    ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", aId).eq("followingId", bId)
      )
      .unique(),
    ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", bId).eq("followingId", aId)
      )
      .unique(),
  ]);
  return Boolean(forward && backward);
}

export async function isFollowing(ctx, followerId, followingId) {
  const row = await ctx.db
    .query("follows")
    .withIndex("by_follower_following", (q) =>
      q.eq("followerId", followerId).eq("followingId", followingId)
    )
    .unique();
  return Boolean(row);
}

export async function conversationIdFor(aId, bId) {
  return aId < bId ? { userA: aId, userB: bId } : { userA: bId, userB: aId };
}
