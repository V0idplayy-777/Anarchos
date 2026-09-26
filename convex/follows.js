import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { badRequest, notFound, publicUser, requireUser } from "./lib/auth";

/**
 * Toggles a follow edge. The edge and both counters are written in the same
 * transaction, and the existence check plus unique index means two concurrent
 * requests can never create a duplicate follow.
 */
export const toggleFollow = mutation({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, { token, userId }) => {
    const viewer = await requireUser(ctx, token);
    if (viewer._id === userId) throw badRequest("You cannot follow yourself.");
    const target = await ctx.db.get(userId);
    if (!target || target.status !== "active") throw notFound("This account no longer exists.");

    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", viewer._id).eq("followingId", userId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      if (viewer.followingCount > 0) {
        await ctx.db.patch(viewer._id, { followingCount: viewer.followingCount - 1 });
      }
      if (target.followerCount > 0) {
        await ctx.db.patch(target._id, { followerCount: target.followerCount - 1 });
      }
      return { following: false, followerCount: Math.max(0, target.followerCount - 1) };
    }

    await ctx.db.insert("follows", {
      followerId: viewer._id,
      followingId: userId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(viewer._id, { followingCount: viewer.followingCount + 1 });
    await ctx.db.patch(target._id, { followerCount: target.followerCount + 1 });
    return { following: true, followerCount: target.followerCount + 1 };
  },
});

export const relationship = query({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, { token, userId }) => {
    const viewer = await requireUser(ctx, token);
    const target = await ctx.db.get(userId);
    if (!target || target.status !== "active") throw notFound("This account no longer exists.");
    const forward = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", viewer._id).eq("followingId", userId)
      )
      .unique();
    const backward = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", userId).eq("followingId", viewer._id)
      )
      .unique();
    return {
      isSelf: viewer._id === userId,
      isFollowing: Boolean(forward),
      followsViewer: Boolean(backward),
      isFriend: Boolean(forward && backward),
      user: publicUser(target),
    };
  },
});
