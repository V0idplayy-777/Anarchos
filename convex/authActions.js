"use node";

/**
 * Authentication actions.
 *
 * These run in the Node.js runtime because password hashing (scrypt) and
 * session token generation require cryptographic primitives that are not
 * available in the V8 sandbox used by queries and mutations.
 *
 * The resulting password hash never leaves the server: only the session token
 * and the public user object are returned to the client.
 */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  DISPLAY_NAME_MAX,
  PASSWORD_MAX,
  badRequest,
  conflict,
  normalizeUsername,
  optionalText,
  rateLimited,
  validatePassword,
  validateUsername,
} from "./lib/auth";
import { createSessionToken, hashPassword, verifyPassword } from "./lib/passwords";

function errorCode(error) {
  return error?.data?.code ?? null;
}

function minutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

async function issueSession(ctx, userId, userAgent) {
  const token = createSessionToken();
  await ctx.runMutation(internal.auth.createSession, {
    userId,
    token,
    userAgent: userAgent ? String(userAgent).slice(0, 200) : undefined,
  });
  return token;
}

export const signUp = action({
  args: {
    username: v.string(),
    password: v.string(),
    displayName: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const username = normalizeUsername(args.username);
    const usernameError = validateUsername(username);
    if (usernameError) throw badRequest(usernameError);
    const passwordError = validatePassword(args.password);
    if (passwordError) throw badRequest(passwordError);
    const name = optionalText(args.displayName, DISPLAY_NAME_MAX, "Display name");
    if (name.error) throw badRequest(name.error);

    const key = `signup:${username}`;
    const throttle = await ctx.runQuery(internal.auth.checkThrottle, { key });
    if (throttle.locked) {
      throw rateLimited(
        `Too many attempts for this username. Try again in ${minutes(throttle.remainingMs)} minutes.`
      );
    }

    const taken = await ctx.runQuery(internal.auth.usernameTaken, { username });
    if (taken) throw conflict("That username is already taken.");

    const passwordHash = hashPassword(args.password);
    let user;
    try {
      user = await ctx.runMutation(internal.auth.createUser, {
        username,
        passwordHash,
        displayName: name.value,
      });
    } catch (error) {
      if (errorCode(error) === "CONFLICT") {
        await ctx.runMutation(internal.auth.recordFailure, { key });
        throw conflict("That username is already taken.");
      }
      throw error;
    }
    await ctx.runMutation(internal.auth.clearFailures, { key });
    const token = await issueSession(ctx, user._id, args.userAgent);
    return { token, user };
  },
});

export const logIn = action({
  args: {
    username: v.string(),
    password: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const username = normalizeUsername(args.username);
    if (!username) throw badRequest("Enter your username.");
    if (typeof args.password !== "string" || args.password.length === 0) {
      throw badRequest("Enter your password.");
    }
    if (args.password.length > PASSWORD_MAX) {
      throw badRequest(`Password must be ${PASSWORD_MAX} characters or fewer.`);
    }

    const key = `login:${username}`;
    const throttle = await ctx.runQuery(internal.auth.checkThrottle, { key });
    if (throttle.locked) {
      throw rateLimited(
        `Too many failed sign-in attempts. Try again in ${minutes(throttle.remainingMs)} minutes.`
      );
    }

    const record = await ctx.runQuery(internal.auth.lookupByUsername, { username });
    if (!record || record.status !== "active" || !verifyPassword(args.password, record.passwordHash)) {
      await ctx.runMutation(internal.auth.recordFailure, { key });
      throw badRequest("Incorrect username or password.");
    }
    await ctx.runMutation(internal.auth.clearFailures, { key });
    const token = await issueSession(ctx, record._id, args.userAgent);
    return { token, user: stripPrivate(record) };
  },
});

export const changePassword = action({
  args: {
    token: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { token, currentPassword, newPassword }) => {
    // Actions have no database handle, so the session is resolved via a query.
    const user = await ctx.runQuery(internal.auth.sessionUser, { token });
    if (typeof currentPassword !== "string" || currentPassword.length === 0) {
      throw badRequest("Enter your current password.");
    }
    const newError = validatePassword(newPassword);
    if (newError) throw badRequest(newError);
    if (newPassword === currentPassword) {
      throw badRequest("Choose a password different from your current one.");
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw badRequest("Your current password is incorrect.");
    }
    await ctx.runMutation(internal.auth.applyPasswordChange, {
      userId: user._id,
      passwordHash: hashPassword(newPassword),
      keepToken: token,
    });
    return { ok: true };
  },
});

/** Strips server-only fields before a user object is returned to the client. */
function stripPrivate(user) {
  const safe = { ...user };
  delete safe.passwordHash;
  return safe;
}
