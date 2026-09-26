import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  CAPTION_MAX,
  COMMENT_MAX,
  MAX_VIDEO_BYTES,
  TITLE_MAX,
  badRequest,
  forbidden,
  notFound,
  optionalText,
  publicUser,
  requireText,
  requireUser,
} from "./lib/auth";

async function hydrateVideos(ctx, videos, viewer) {
  const authorIds = [...new Set(videos.map((v) => v.authorId))];
  const authors = new Map();
  for (const id of authorIds) {
    const author = await ctx.db.get(id);
    if (author) authors.set(id, author);
  }
  const followingAuthors = new Set();
  if (viewer) {
    for (const id of authorIds) {
      if (id === viewer._id) continue;
      const edge = await ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) =>
          q.eq("followerId", viewer._id).eq("followingId", id)
        )
        .unique();
      if (edge) followingAuthors.add(id);
    }
  }
  const liked = new Set();
  if (viewer) {
    for (const video of videos) {
      const like = await ctx.db
        .query("likes")
        .withIndex("by_video_user", (q) => q.eq("videoId", video._id).eq("userId", viewer._id))
        .unique();
      if (like) liked.add(video._id);
    }
  }
  const hydrated = [];
  for (const video of videos) {
    let url = null;
    try {
      url = await ctx.storage.getUrl(video.storageId);
    } catch {
      url = null;
    }
    let thumbnailUrl = null;
    if (video.thumbnailStorageId) {
      try {
        thumbnailUrl = await ctx.storage.getUrl(video.thumbnailStorageId);
      } catch {
        thumbnailUrl = null;
      }
    }
    const author = authors.get(video.authorId);
    let avatarUrl = null;
    if (author?.avatarStorageId) {
      try {
        avatarUrl = await ctx.storage.getUrl(author.avatarStorageId);
      } catch {
        avatarUrl = null;
      }
    }
    hydrated.push({
      _id: video._id,
      _creationTime: video._creationTime,
      title: video.title,
      caption: video.caption ?? "",
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      createdAt: video.createdAt,
      sizeBytes: video.sizeBytes,
      contentType: video.contentType,
      durationSeconds: video.durationSeconds ?? null,
      videoUrl: url,
      thumbnailUrl,
      kind: video.kind === "reel" ? "reel" : "video",
      likedByViewer: liked.has(video._id),
      author: author
        ? {
            ...publicUser(author),
            avatarUrl,
            isFollowing: followingAuthors.has(author._id),
          }
        : { _id: video.authorId, username: "deleted", displayName: "Deleted account", avatarUrl: null },
    });
  }
  return hydrated;
}

async function getVideoOrThrow(ctx, videoId) {
  const video = await ctx.db.get(videoId);
  if (!video || video.status !== "published") {
    throw notFound("This video is no longer available.");
  }
  return video;
}

/** Authenticated short-lived upload URL. The file itself is validated on publish. */
export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireUser(ctx, token);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Creates the video record. Metadata is read back from Convex storage, so the
 * browser-supplied MIME type is never trusted for validation.
 */
export const publishVideo = mutation({
  args: {
    token: v.string(),
    storageId: v.id("_storage"),
    thumbnailStorageId: v.optional(v.id("_storage")),
    durationSeconds: v.optional(v.number()),
    kind: v.optional(v.string()),
    title: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { token, storageId, thumbnailStorageId, durationSeconds, kind, title, caption }) => {
    const user = await requireUser(ctx, token);
    const parsedTitle = requireText(title, TITLE_MAX, "Title");
    if (parsedTitle.error) throw badRequest(parsedTitle.error);
    const parsedCaption = optionalText(caption, CAPTION_MAX, "Caption");
    if (parsedCaption.error) throw badRequest(parsedCaption.error);

    let metadata;
    try {
      metadata = await ctx.storage.getMetadata(storageId);
    } catch {
      throw badRequest("That upload is no longer available. Please upload the video again.");
    }
    const contentType = metadata?.contentType ?? "";
    const size = metadata?.size ?? 0;
    if (!contentType.startsWith("video/")) {
      await ctx.storage.delete(storageId);
      throw badRequest("Only video files can be published.");
    }
    if (size === 0) {
      await ctx.storage.delete(storageId);
      throw badRequest("That file appears to be empty.");
    }
    if (size > MAX_VIDEO_BYTES) {
      await ctx.storage.delete(storageId);
      throw badRequest("Videos must be 100 MB or smaller.");
    }

    if (thumbnailStorageId) {
      try {
        const thumbMeta = await ctx.storage.getMetadata(thumbnailStorageId);
        if (!thumbMeta?.contentType?.startsWith("image/")) {
          await ctx.storage.delete(thumbnailStorageId);
          throw badRequest("Thumbnail must be an image file.");
        }
      } catch (err) {
        if (err?.data?.code === "BAD_REQUEST") throw err;
        throw badRequest("Could not verify thumbnail file.");
      }
    }

    let parsedDuration = undefined;
    if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
      parsedDuration = Math.min(Math.round(durationSeconds), 86400);
    }

    const resolvedKind = kind === "reel" ? "reel" : "video";

    const now = Date.now();
    const videoId = await ctx.db.insert("videos", {
      storageId,
      thumbnailStorageId: thumbnailStorageId ?? undefined,
      durationSeconds: parsedDuration,
      authorId: user._id,
      title: parsedTitle.text,
      caption: parsedCaption.value,
      contentType,
      sizeBytes: size,
      likeCount: 0,
      commentCount: 0,
      status: "published",
      kind: resolvedKind,
      createdAt: now,
    });
    await ctx.db.patch(user._id, { videoCount: user.videoCount + 1, updatedAt: now });
    return { videoId };
  },
});

export const listFeed = query({
  args: {
    paginationOpts: paginationOptsValidator,
    token: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, token }) => {
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    const page = await ctx.db
      .query("videos")
      .withIndex("by_status_created", (q) => q.eq("status", "published"))
      .order("desc")
      .paginate(paginationOpts);
    const videosOnly = page.page.filter((row) => (row.kind ?? "video") !== "reel");
    return { ...page, page: await hydrateVideos(ctx, videosOnly, viewer) };
  },
});

export const listReels = query({
  args: {
    paginationOpts: paginationOptsValidator,
    token: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, token }) => {
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    const page = await ctx.db
      .query("videos")
      .withIndex("by_kind_status_created", (q) => q.eq("kind", "reel").eq("status", "published"))
      .order("desc")
      .paginate(paginationOpts);
    return { ...page, page: await hydrateVideos(ctx, page.page, viewer) };
  },
});

export const listByAuthor = query({
  args: {
    paginationOpts: paginationOptsValidator,
    username: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    token: v.optional(v.string()),
    kind: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, username, userId, token, kind }) => {
    let authorId = userId;
    if (!authorId) {
      const normalized = String(username ?? "").toLowerCase();
      const author = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", normalized))
        .unique();
      if (!author || author.status !== "active") {
        return { page: [], continueCursor: "", isDone: true };
      }
      authorId = author._id;
    }
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    const page = await ctx.db
      .query("videos")
      .withIndex("by_author_created", (q) => q.eq("authorId", authorId))
      .order("desc")
      .paginate(paginationOpts);
    const wanted = kind === "reel" ? "reel" : "video";
    const filtered = page.page.filter((row) => (row.kind ?? "video") === wanted);
    return { ...page, page: await hydrateVideos(ctx, filtered, viewer) };
  },
});

export const getVideo = query({
  args: { videoId: v.id("videos"), token: v.optional(v.string()) },
  handler: async (ctx, { videoId, token }) => {
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    let video;
    try {
      video = await getVideoOrThrow(ctx, videoId);
    } catch {
      return null;
    }
    const [hydrated] = await hydrateVideos(ctx, [video], viewer);
    return { ...hydrated, canManage: viewer?._id === video.authorId };
  },
});

/** Likes and unlikes. Uniqueness is enforced by index check + same-transaction write. */
export const toggleLike = mutation({
  args: { token: v.string(), videoId: v.id("videos") },
  handler: async (ctx, { token, videoId }) => {
    const viewer = await requireUser(ctx, token);
    const video = await getVideoOrThrow(ctx, videoId);
    const existing = await ctx.db
      .query("likes")
      .withIndex("by_video_user", (q) => q.eq("videoId", videoId).eq("userId", viewer._id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(videoId, { likeCount: Math.max(0, video.likeCount - 1) });
      return { liked: false, likeCount: Math.max(0, video.likeCount - 1) };
    }
    await ctx.db.insert("likes", {
      videoId,
      userId: viewer._id,
      createdAt: Date.now(),
    });
    await ctx.db.patch(videoId, { likeCount: video.likeCount + 1 });
    return { liked: true, likeCount: video.likeCount + 1 };
  },
});

export const listComments = query({
  args: { videoId: v.id("videos"), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { videoId, cursor, limit }) => {
    const video = await ctx.db.get(videoId);
    if (!video || video.status !== "published") {
      return { page: [], continueCursor: null, isDone: true };
    }
    const page = await ctx.db
      .query("comments")
      .withIndex("by_video_status_created", (q) =>
        q.eq("videoId", videoId).eq("status", "visible")
      )
      .order("desc")
      .paginate({ cursor: cursor ?? null, numItems: Math.min(limit ?? 30, 50) });
    const authors = new Map();
    const hydrated = [];
    for (const comment of page.page) {
      let author = authors.get(comment.authorId);
      if (author === undefined) {
        author = await ctx.db.get(comment.authorId);
        authors.set(comment.authorId, author);
      }
      hydrated.push({
        _id: comment._id,
        text: comment.text,
        createdAt: comment.createdAt,
        authorId: comment.authorId,
        author: author
          ? { ...publicUser(author), avatarUrl: null }
          : { _id: comment.authorId, username: "deleted", displayName: "Deleted account" },
      });
    }
    // Resolve avatars for the page in a second pass so it stays batched.
    const withAvatars = [];
    for (const comment of hydrated) {
      const author = authors.get(comment.authorId);
      let avatarUrl = null;
      if (author?.avatarStorageId) {
        try {
          avatarUrl = await ctx.storage.getUrl(author.avatarStorageId);
        } catch {
          avatarUrl = null;
        }
      }
      withAvatars.push({ ...comment, author: { ...comment.author, avatarUrl } });
    }
    return { page: withAvatars, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

export const addComment = mutation({
  args: { token: v.string(), videoId: v.id("videos"), text: v.string() },
  handler: async (ctx, { token, videoId, text }) => {
    const viewer = await requireUser(ctx, token);
    const video = await getVideoOrThrow(ctx, videoId);
    const parsed = requireText(text, COMMENT_MAX, "Comment");
    if (parsed.error) throw badRequest(parsed.error);
    const commentId = await ctx.db.insert("comments", {
      videoId,
      authorId: viewer._id,
      text: parsed.text,
      status: "visible",
      createdAt: Date.now(),
    });
    await ctx.db.patch(videoId, { commentCount: video.commentCount + 1 });
    return {
      commentId,
      commentCount: video.commentCount + 1,
      comment: {
        _id: commentId,
        text: parsed.text,
        createdAt: Date.now(),
        authorId: viewer._id,
        author: { ...publicUser(viewer), avatarUrl: null },
      },
    };
  },
});

export const deleteComment = mutation({
  args: { token: v.string(), commentId: v.id("comments") },
  handler: async (ctx, { token, commentId }) => {
    const viewer = await requireUser(ctx, token);
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.status !== "visible") throw notFound("That comment no longer exists.");
    const video = await ctx.db.get(comment.videoId);
    if (!video) throw notFound("This video is no longer available.");
    // Only the author of the comment or the owner of the video may remove it.
    if (comment.authorId !== viewer._id && video.authorId !== viewer._id) {
      throw forbidden("You can only delete your own comments.");
    }
    await ctx.db.patch(commentId, { status: "removed" });
    await ctx.db.delete(commentId);
    await ctx.db.patch(video._id, { commentCount: Math.max(0, video.commentCount - 1) });
    return { commentCount: Math.max(0, video.commentCount - 1) };
  },
});

export const deleteVideo = mutation({
  args: { token: v.string(), videoId: v.id("videos") },
  handler: async (ctx, { token, videoId }) => {
    const viewer = await requireUser(ctx, token);
    const video = await ctx.db.get(videoId);
    if (!video) throw notFound("This video is no longer available.");
    if (video.authorId !== viewer._id) {
      throw forbidden("You can only delete your own videos.");
    }
    for (const like of await ctx.db
      .query("likes")
      .withIndex("by_video_user", (q) => q.eq("videoId", videoId))
      .collect()) {
      await ctx.db.delete(like._id);
    }
    for (const comment of await ctx.db
      .query("comments")
      .withIndex("by_video_status_created", (q) => q.eq("videoId", videoId))
      .collect()) {
      await ctx.db.delete(comment._id);
    }
    await ctx.db.delete(videoId);
    try {
      await ctx.storage.delete(video.storageId);
    } catch {
      /* file already gone */
    }
    if (video.thumbnailStorageId) {
      try {
        await ctx.storage.delete(video.thumbnailStorageId);
      } catch {
        /* file already gone */
      }
    }
    const author = await ctx.db.get(viewer._id);
    if (author && author.videoCount > 0) {
      await ctx.db.patch(viewer._id, { videoCount: author.videoCount - 1 });
    }
    return { ok: true };
  },
});
