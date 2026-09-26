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
  optionalUser,
} from "./lib/auth";

const ALLOWED_CATEGORIES = ["music", "gaming", "vlog", "education", "comedy", "tech", "sports", "news", "other"];
const ALLOWED_TAGS = ["music", "gaming", "vlog", "education", "comedy", "tech", "sports", "news", "funny", "tutorial", "live", "travel", "food", "art", "fitness", "other"];
const MAX_TAGS = 8;

function normalizeTag(t) {
  return String(t ?? "").trim().toLowerCase().slice(0, 24);
}

function validateTags(tags) {
  if (!tags) return [];
  const cleaned = [...new Set(tags.map(normalizeTag).filter(Boolean))].slice(0, MAX_TAGS);
  // Allow any tag but warn if not in allowed list - we keep permissive
  return cleaned;
}

function normalizeCategory(cat) {
  if (!cat) return undefined;
  const c = String(cat).trim().toLowerCase();
  if (!c) return undefined;
  if (!ALLOWED_CATEGORIES.includes(c)) return "other";
  return c;
}

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
    let captionFileUrl = null;
    if (video.captionFileStorageId) {
      try {
        captionFileUrl = await ctx.storage.getUrl(video.captionFileStorageId);
      } catch {
        captionFileUrl = null;
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
      titleSearch: video.titleSearch ?? video.title.toLowerCase(),
      caption: video.caption ?? "",
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt ?? video.createdAt,
      sizeBytes: video.sizeBytes,
      contentType: video.contentType,
      durationSeconds: video.durationSeconds ?? null,
      videoUrl: url,
      thumbnailUrl,
      captionFileUrl,
      autoCaptions: video.autoCaptions ?? "",
      kind: video.kind === "reel" ? "reel" : "video",
      tags: video.tags ?? [],
      category: video.category ?? null,
      viewCount: video.viewCount ?? 0,
      totalWatchTimeSeconds: video.totalWatchTimeSeconds ?? 0,
      completionCount: video.completionCount ?? 0,
      trendingScore: video.trendingScore ?? 0,
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

function computeTrendingScore(video) {
  const now = Date.now();
  const ageHours = Math.max(1, (now - video.createdAt) / (1000 * 60 * 60));
  // Weighted: likes*2 + comments*3 + views*0.1 + completions*5, decay by age
  const likes = video.likeCount ?? 0;
  const comments = video.commentCount ?? 0;
  const views = video.viewCount ?? 0;
  const completions = video.completionCount ?? 0;
  const raw = likes * 2 + comments * 3 + views * 0.5 + completions * 5;
  // Time decay: divide by log(age) factor
  const decay = Math.log10(ageHours + 1) + 1;
  return raw / decay;
}

/** Authenticated short-lived upload URL. The file itself is validated on publish. */
export const generateUploadUrl = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    if (token) {
      await requireUser(ctx, token);
    } else {
      // For guest caption uploads we still need auth - but allow anonymous for video? Keep requiring auth for now
      // Actually for guest viewing we don't need upload. So require token if provided, but we allow generation for authenticated only
      // If token is undefined, we still generate? No, require auth for uploads.
      throw badRequest("Authentication required to upload.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/** Generate upload URL for captions (vtt/srt) */
export const generateCaptionUploadUrl = mutation({
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
    captionFileStorageId: v.optional(v.id("_storage")),
    autoCaptions: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    kind: v.optional(v.string()),
    title: v.string(),
    caption: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { token, storageId, thumbnailStorageId, captionFileStorageId, autoCaptions, durationSeconds, kind, title, caption, tags, category }) => {
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

    if (captionFileStorageId) {
      try {
        const capMeta = await ctx.storage.getMetadata(captionFileStorageId);
        const ct = capMeta?.contentType ?? "";
        const isValid = ct.includes("vtt") || ct.includes("srt") || ct.includes("text") || ct === "application/octet-stream";
        if (!isValid) {
          // Still allow but warn - many browsers upload as text/plain
        }
        if ((capMeta?.size ?? 0) > 2 * 1024 * 1024) {
          await ctx.storage.delete(captionFileStorageId);
          throw badRequest("Caption files must be 2 MB or smaller.");
        }
      } catch (err) {
        if (err?.data?.code === "BAD_REQUEST") throw err;
        throw badRequest("Could not verify caption file.");
      }
    }

    let parsedDuration = undefined;
    if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
      parsedDuration = Math.min(Math.round(durationSeconds), 86400);
    }

    const resolvedKind = kind === "reel" ? "reel" : "video";
    const cleanedTags = validateTags(tags);
    const cleanedCategory = normalizeCategory(category);

    let autoCaptionsCleaned = undefined;
    if (autoCaptions) {
      const trimmed = String(autoCaptions).trim().slice(0, 5000);
      if (trimmed) autoCaptionsCleaned = trimmed;
    }

    const now = Date.now();
    const videoId = await ctx.db.insert("videos", {
      storageId,
      thumbnailStorageId: thumbnailStorageId ?? undefined,
      captionFileStorageId: captionFileStorageId ?? undefined,
      autoCaptions: autoCaptionsCleaned,
      durationSeconds: parsedDuration,
      authorId: user._id,
      title: parsedTitle.text,
      titleSearch: parsedTitle.text.toLowerCase(),
      caption: parsedCaption.value,
      captionSearch: parsedCaption.value ? parsedCaption.value.toLowerCase() : undefined,
      contentType,
      sizeBytes: size,
      likeCount: 0,
      commentCount: 0,
      viewCount: 0,
      totalWatchTimeSeconds: 0,
      completionCount: 0,
      trendingScore: 0,
      status: "published",
      kind: resolvedKind,
      tags: cleanedTags.length > 0 ? cleanedTags : undefined,
      category: cleanedCategory,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(user._id, { videoCount: user.videoCount + 1, updatedAt: now });
    return { videoId };
  },
});

/** Edit published posts: titles, descriptions, thumbnails, captions, tags */
export const updateVideo = mutation({
  args: {
    token: v.string(),
    videoId: v.id("videos"),
    title: v.optional(v.string()),
    caption: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    captionFileStorageId: v.optional(v.id("_storage")),
    autoCaptions: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    removeThumbnail: v.optional(v.boolean()),
    removeCaptionFile: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, videoId, title, caption, thumbnailStorageId, captionFileStorageId, autoCaptions, tags, category, removeThumbnail, removeCaptionFile }) => {
    const user = await requireUser(ctx, token);
    const video = await ctx.db.get(videoId);
    if (!video || video.status !== "published") throw notFound("This video is no longer available.");
    if (video.authorId !== user._id) throw forbidden("You can only edit your own videos.");

    const patch = { updatedAt: Date.now() };

    if (title !== undefined) {
      const parsed = requireText(title, TITLE_MAX, "Title");
      if (parsed.error) throw badRequest(parsed.error);
      patch.title = parsed.text;
      patch.titleSearch = parsed.text.toLowerCase();
    }
    if (caption !== undefined) {
      const parsed = optionalText(caption, CAPTION_MAX, "Caption");
      if (parsed.error) throw badRequest(parsed.error);
      patch.caption = parsed.value;
      patch.captionSearch = parsed.value ? parsed.value.toLowerCase() : undefined;
    }
    if (tags !== undefined) {
      patch.tags = validateTags(tags);
    }
    if (category !== undefined) {
      patch.category = normalizeCategory(category);
    }
    if (autoCaptions !== undefined) {
      const trimmed = String(autoCaptions).trim().slice(0, 5000);
      patch.autoCaptions = trimmed || undefined;
    }

    if (thumbnailStorageId) {
      try {
        const meta = await ctx.storage.getMetadata(thumbnailStorageId);
        if (!meta?.contentType?.startsWith("image/")) {
          await ctx.storage.delete(thumbnailStorageId);
          throw badRequest("Thumbnail must be an image file.");
        }
      } catch (err) {
        if (err?.data?.code === "BAD_REQUEST") throw err;
        throw badRequest("Could not verify thumbnail file.");
      }
      // Delete old thumbnail
      if (video.thumbnailStorageId) {
        try { await ctx.storage.delete(video.thumbnailStorageId); } catch {}
      }
      patch.thumbnailStorageId = thumbnailStorageId;
    } else if (removeThumbnail) {
      if (video.thumbnailStorageId) {
        try { await ctx.storage.delete(video.thumbnailStorageId); } catch {}
      }
      patch.thumbnailStorageId = undefined;
    }

    if (captionFileStorageId) {
      try {
        const meta = await ctx.storage.getMetadata(captionFileStorageId);
        if ((meta?.size ?? 0) > 2 * 1024 * 1024) {
          await ctx.storage.delete(captionFileStorageId);
          throw badRequest("Caption files must be 2 MB or smaller.");
        }
      } catch (err) {
        if (err?.data?.code === "BAD_REQUEST") throw err;
        throw badRequest("Could not verify caption file.");
      }
      if (video.captionFileStorageId) {
        try { await ctx.storage.delete(video.captionFileStorageId); } catch {}
      }
      patch.captionFileStorageId = captionFileStorageId;
    } else if (removeCaptionFile) {
      if (video.captionFileStorageId) {
        try { await ctx.storage.delete(video.captionFileStorageId); } catch {}
      }
      patch.captionFileStorageId = undefined;
    }

    await ctx.db.patch(videoId, patch);
    return { ok: true };
  },
});

export const listFeed = query({
  args: {
    paginationOpts: paginationOptsValidator,
    token: v.optional(v.string()),
    sort: v.optional(v.string()), // "chronological" | "trending" | "popular"
    category: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, token, sort, category, tag }) => {
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    const sortMode = sort === "trending" || sort === "popular" ? "trending" : "chronological";

    if (sortMode === "trending") {
      // For trending we need to fetch more and sort in memory because Convex doesn't support custom sort on computed score without index scan.
      // We'll take up to 100 recent published videos and sort by trending score + recency.
      const all = await ctx.db
        .query("videos")
        .withIndex("by_status_created", (q) => q.eq("status", "published"))
        .order("desc")
        .take(200);
      let filtered = all.filter((row) => (row.kind ?? "video") !== "reel");
      if (category) {
        filtered = filtered.filter((v) => v.category === category);
      }
      if (tag) {
        const t = tag.toLowerCase();
        filtered = filtered.filter((v) => (v.tags ?? []).includes(t));
      }
      // Compute fresh score
      filtered.sort((a, b) => {
        const sa = computeTrendingScore(a);
        const sb = computeTrendingScore(b);
        return sb - sa;
      });
      // Manual pagination using cursor as offset
      const cursor = paginationOpts.cursor ? parseInt(paginationOpts.cursor, 10) || 0 : 0;
      const num = paginationOpts.numItems;
      const pageSlice = filtered.slice(cursor, cursor + num);
      const nextCursor = cursor + num < filtered.length ? String(cursor + num) : null;
      return {
        page: await hydrateVideos(ctx, pageSlice, viewer),
        continueCursor: nextCursor ?? "",
        isDone: nextCursor === null,
      };
    } else {
      // Chronological with optional filters - we need to filter after fetching because indexes don't cover category/tag easily
      if (category || tag) {
        // Fetch larger page and filter
        const page = await ctx.db
          .query("videos")
          .withIndex("by_status_created", (q) => q.eq("status", "published"))
          .order("desc")
          .take(100);
        let filtered = page.filter((row) => (row.kind ?? "video") !== "reel");
        if (category) filtered = filtered.filter((v) => v.category === category);
        if (tag) {
          const t = tag.toLowerCase();
          filtered = filtered.filter((v) => (v.tags ?? []).includes(t));
        }
        const cursor = paginationOpts.cursor ? parseInt(paginationOpts.cursor, 10) || 0 : 0;
        const num = paginationOpts.numItems;
        const slice = filtered.slice(cursor, cursor + num);
        const nextCursor = cursor + num < filtered.length ? String(cursor + num) : null;
        // If not enough results, we approximate isDone; for simplicity we return paginated style
        return {
          page: await hydrateVideos(ctx, slice, viewer),
          continueCursor: nextCursor ?? "",
          isDone: filtered.length <= cursor + num,
        };
      } else {
        const page = await ctx.db
          .query("videos")
          .withIndex("by_status_created", (q) => q.eq("status", "published"))
          .order("desc")
          .paginate(paginationOpts);
        const videosOnly = page.page.filter((row) => (row.kind ?? "video") !== "reel");
        return { ...page, page: await hydrateVideos(ctx, videosOnly, viewer) };
      }
    }
  },
});

export const listFollowingFeed = query({
  args: {
    paginationOpts: paginationOptsValidator,
    token: v.string(),
    kind: v.optional(v.string()), // "video" | "reel"
  },
  handler: async (ctx, { paginationOpts, token, kind }) => {
    const viewer = await requireUser(ctx, token);
    const wantedKind = kind === "reel" ? "reel" : "video";
    // Get who viewer follows
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) => q.eq("followerId", viewer._id))
      .collect();
    const followingIds = new Set(follows.map((f) => f.followingId));
    if (followingIds.size === 0) {
      return { page: [], continueCursor: "", isDone: true };
    }
    // Fetch recent videos and filter by following
    // Since we can't query by multiple authorIds efficiently, we fetch recent and filter
    const page = await ctx.db
      .query("videos")
      .withIndex("by_status_created", (q) => q.eq("status", "published"))
      .order("desc")
      .take(200);
    const filtered = page.filter((v) => followingIds.has(v.authorId) && (v.kind ?? "video") === wantedKind);
    const cursor = paginationOpts.cursor ? parseInt(paginationOpts.cursor, 10) || 0 : 0;
    const num = paginationOpts.numItems;
    const slice = filtered.slice(cursor, cursor + num);
    const nextCursor = cursor + num < filtered.length ? String(cursor + num) : null;
    return {
      page: await hydrateVideos(ctx, slice, viewer),
      continueCursor: nextCursor ?? "",
      isDone: nextCursor === null,
    };
  },
});

export const listReels = query({
  args: {
    paginationOpts: paginationOptsValidator,
    token: v.optional(v.string()),
    filter: v.optional(v.string()), // "all" | "following"
  },
  handler: async (ctx, { paginationOpts, token, filter }) => {
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    if (filter === "following" && viewer) {
      const follows = await ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) => q.eq("followerId", viewer._id))
        .collect();
      const followingIds = new Set(follows.map((f) => f.followingId));
      if (followingIds.size === 0) {
        return { page: [], continueCursor: "", isDone: true };
      }
      const all = await ctx.db
        .query("videos")
        .withIndex("by_kind_status_created", (q) => q.eq("kind", "reel").eq("status", "published"))
        .order("desc")
        .take(200);
      const filtered = all.filter((v) => followingIds.has(v.authorId));
      const cursor = paginationOpts.cursor ? parseInt(paginationOpts.cursor, 10) || 0 : 0;
      const num = paginationOpts.numItems;
      const slice = filtered.slice(cursor, cursor + num);
      const nextCursor = cursor + num < filtered.length ? String(cursor + num) : null;
      return {
        page: await hydrateVideos(ctx, slice, viewer),
        continueCursor: nextCursor ?? "",
        isDone: nextCursor === null,
      };
    }
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

/** Public guest version: same as getVideo but explicitly allows null token */
export const getVideoPublic = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    let video;
    try {
      video = await getVideoOrThrow(ctx, videoId);
    } catch {
      return null;
    }
    const [hydrated] = await hydrateVideos(ctx, [video], null);
    return { ...hydrated, canManage: false };
  },
});

/** Video search: titles, descriptions, tags, with filters for content type and upload date */
export const searchVideos = query({
  args: {
    query: v.string(),
    token: v.optional(v.string()),
    kind: v.optional(v.string()), // "video" | "reel" | "all"
    category: v.optional(v.string()),
    tag: v.optional(v.string()),
    uploadDate: v.optional(v.string()), // "today" | "week" | "month" | "year" | "all"
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query: rawQuery, token, kind, category, tag, uploadDate, limit }) => {
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    const term = String(rawQuery ?? "").trim().toLowerCase().slice(0, 100);
    if (term.length === 0) return { videos: [], term: "" };
    const max = Math.min(Math.max(limit ?? 24, 1), 50);

    // Fetch recent published videos (we can't do full text search without search index, so we filter in memory)
    const all = await ctx.db
      .query("videos")
      .withIndex("by_status_created", (q) => q.eq("status", "published"))
      .order("desc")
      .take(300);

    let filtered = all;

    // Kind filter
    if (kind === "video") filtered = filtered.filter((v) => (v.kind ?? "video") === "video");
    else if (kind === "reel") filtered = filtered.filter((v) => v.kind === "reel");

    // Category filter
    if (category) {
      filtered = filtered.filter((v) => v.category === category);
    }

    // Tag filter
    if (tag) {
      const t = tag.toLowerCase();
      filtered = filtered.filter((v) => (v.tags ?? []).includes(t));
    }

    // Upload date filter
    if (uploadDate && uploadDate !== "all") {
      const now = Date.now();
      let cutoff = 0;
      if (uploadDate === "today") cutoff = now - 24 * 60 * 60 * 1000;
      else if (uploadDate === "week") cutoff = now - 7 * 24 * 60 * 60 * 1000;
      else if (uploadDate === "month") cutoff = now - 30 * 24 * 60 * 60 * 1000;
      else if (uploadDate === "year") cutoff = now - 365 * 24 * 60 * 60 * 1000;
      if (cutoff) filtered = filtered.filter((v) => v.createdAt >= cutoff);
    }

    // Search in title, caption, tags
    const terms = term.split(/\s+/).filter(Boolean);
    filtered = filtered.filter((v) => {
      const haystack = [
        v.titleSearch ?? v.title.toLowerCase(),
        v.captionSearch ?? (v.caption ?? "").toLowerCase(),
        (v.tags ?? []).join(" ").toLowerCase(),
        v.category ?? "",
      ].join(" ");
      return terms.every((t) => haystack.includes(t));
    });

    // Rank: title match boost, then recent
    filtered.sort((a, b) => {
      const aTitle = (a.titleSearch ?? a.title.toLowerCase()).includes(term) ? 0 : 1;
      const bTitle = (b.titleSearch ?? b.title.toLowerCase()).includes(term) ? 0 : 1;
      if (aTitle !== bTitle) return aTitle - bTitle;
      return b.createdAt - a.createdAt;
    });

    const page = filtered.slice(0, max);
    const hydrated = await hydrateVideos(ctx, page, viewer);
    return { term, videos: hydrated };
  },
});

/** Trending / Popular sort */
export const listTrending = query({
  args: {
    paginationOpts: paginationOptsValidator,
    token: v.optional(v.string()),
    kind: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, token, kind }) => {
    const viewer = token ? await requireUser(ctx, token).catch(() => null) : null;
    const wantedKind = kind === "reel" ? "reel" : kind === "video" ? "video" : null;
    const all = await ctx.db
      .query("videos")
      .withIndex("by_status_created", (q) => q.eq("status", "published"))
      .order("desc")
      .take(300);
    let filtered = all;
    if (wantedKind) filtered = filtered.filter((v) => (v.kind ?? "video") === wantedKind);
    filtered.sort((a, b) => computeTrendingScore(b) - computeTrendingScore(a));
    const cursor = paginationOpts.cursor ? parseInt(paginationOpts.cursor, 10) || 0 : 0;
    const num = paginationOpts.numItems;
    const slice = filtered.slice(cursor, cursor + num);
    const nextCursor = cursor + num < filtered.length ? String(cursor + num) : null;
    return {
      page: await hydrateVideos(ctx, slice, viewer),
      continueCursor: nextCursor ?? "",
      isDone: nextCursor === null,
    };
  },
});

/** Useful analytics: genuine views, avg watch time, completion rate, follower growth */
export const getVideoAnalytics = query({
  args: { videoId: v.id("videos"), token: v.string() },
  handler: async (ctx, { videoId, token }) => {
    const viewer = await requireUser(ctx, token);
    const video = await ctx.db.get(videoId);
    if (!video) throw notFound("Video not found.");
    if (video.authorId !== viewer._id) throw forbidden("Only the author can view analytics.");
    const views = await ctx.db
      .query("videoViews")
      .withIndex("by_video_created", (q) => q.eq("videoId", videoId))
      .collect();
    const totalViews = video.viewCount ?? views.length;
    const totalWatch = video.totalWatchTimeSeconds ?? views.reduce((sum, v) => sum + (v.watchTimeSeconds ?? 0), 0);
    const completions = video.completionCount ?? views.filter((v) => v.completed).length;
    const avgWatch = totalViews > 0 ? totalWatch / totalViews : 0;
    const completionRate = totalViews > 0 ? (completions / totalViews) * 100 : 0;

    // Views over time (last 7 days daily)
    const now = Date.now();
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now - i * 24 * 60 * 60 * 1000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;
      const count = views.filter((v) => v.createdAt >= dayStart.getTime() && v.createdAt < dayEnd).length;
      daily.push({ date: dayStart.toISOString().slice(0, 10), count });
    }

    return {
      viewCount: totalViews,
      totalWatchTimeSeconds: totalWatch,
      avgWatchTimeSeconds: avgWatch,
      completionCount: completions,
      completionRate,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      dailyViews: daily,
      definition: "A view counts when a viewer watches at least 3 seconds or 25% of the video, whichever is smaller. Repeated views from same user within 5 minutes are filtered. Automated or suspicious rapid repeats are ignored.",
    };
  },
});

export const getChannelAnalytics = query({
  args: { token: v.string(), username: v.optional(v.string()) },
  handler: async (ctx, { token, username }) => {
    const viewer = await requireUser(ctx, token);
    let targetId = viewer._id;
    if (username) {
      const normalized = String(username).toLowerCase();
      const user = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", normalized))
        .unique();
      if (!user) throw notFound("User not found.");
      if (user._id !== viewer._id) throw forbidden("You can only view your own analytics.");
      targetId = user._id;
    }
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_author_created", (q) => q.eq("authorId", targetId))
      .collect();
    const totalViews = videos.reduce((sum, v) => sum + (v.viewCount ?? 0), 0);
    const totalLikes = videos.reduce((sum, v) => sum + (v.likeCount ?? 0), 0);
    const totalWatch = videos.reduce((sum, v) => sum + (v.totalWatchTimeSeconds ?? 0), 0);
    const avgWatch = totalViews > 0 ? totalWatch / totalViews : 0;

    // Follower growth last 30 days
    const now = Date.now();
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_following_follower", (q) => q.eq("followingId", targetId))
      .collect();
    const dailyFollowers = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now - i * 24 * 60 * 60 * 1000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;
      const count = follows.filter((f) => f.createdAt >= dayStart.getTime() && f.createdAt < dayEnd).length;
      dailyFollowers.push({ date: dayStart.toISOString().slice(0, 10), newFollowers: count });
    }

    return {
      totalVideos: videos.length,
      totalViews,
      totalLikes,
      totalWatchTimeSeconds: totalWatch,
      avgWatchTimeSeconds: avgWatch,
      followerCount: viewer.followerCount,
      followingCount: viewer.followingCount,
      dailyFollowers,
    };
  },
});

/** Record a view: defines what counts as view and filters repeated/automated */
export const recordView = mutation({
  args: {
    videoId: v.id("videos"),
    token: v.optional(v.string()),
    watchTimeSeconds: v.optional(v.number()),
    completed: v.optional(v.boolean()),
    fingerprint: v.optional(v.string()),
  },
  handler: async (ctx, { videoId, token, watchTimeSeconds, completed, fingerprint }) => {
    const viewer = token ? await optionalUser(ctx, token) : null;
    const video = await ctx.db.get(videoId);
    if (!video || video.status !== "published") throw notFound("Video not found.");

    const now = Date.now();
    const duration = video.durationSeconds ?? 0;

    // What counts as a view: >=3s or 25% of duration (whichever smaller), and < 3s if video is very short
    const minViewTime = duration > 0 ? Math.min(3, duration * 0.25) : 3;
    const watched = watchTimeSeconds ?? 0;
    if (watched < minViewTime && !completed) {
      // Not enough to count as view, but still record watch time for analytics if >0
      if (watched > 0) {
        // Update total watch time without incrementing view count
        await ctx.db.patch(videoId, {
          totalWatchTimeSeconds: (video.totalWatchTimeSeconds ?? 0) + watched,
        });
      }
      return { counted: false, reason: "Not enough watch time" };
    }

    // Filter obvious repeated or automated activity: same user/fingerprint within 5 minutes
    const windowMs = 5 * 60 * 1000;
    let recentViews = [];
    if (viewer) {
      recentViews = await ctx.db
        .query("videoViews")
        .withIndex("by_video_user", (q) => q.eq("videoId", videoId).eq("userId", viewer._id))
        .order("desc")
        .take(5);
    } else if (fingerprint) {
      const all = await ctx.db
        .query("videoViews")
        .withIndex("by_video_created", (q) => q.eq("videoId", videoId))
        .order("desc")
        .take(50);
      recentViews = all.filter((v) => v.fingerprint === fingerprint);
    }

    const tooRecent = recentViews.some((v) => now - v.createdAt < windowMs);
    if (tooRecent) {
      return { counted: false, reason: "Filtered as repeated view within 5 minutes" };
    }

    // Filter automated: if same user has > 30 views in last hour for same video
    const hourAgo = now - 60 * 60 * 1000;
    const recentHour = recentViews.filter((v) => v.createdAt > hourAgo);
    if (recentHour.length > 30) {
      return { counted: false, reason: "Filtered as automated activity" };
    }

    await ctx.db.insert("videoViews", {
      videoId,
      userId: viewer?._id,
      fingerprint,
      watchTimeSeconds: watched,
      completed: Boolean(completed),
      createdAt: now,
    });

    await ctx.db.patch(videoId, {
      viewCount: (video.viewCount ?? 0) + 1,
      totalWatchTimeSeconds: (video.totalWatchTimeSeconds ?? 0) + watched,
      completionCount: completed ? (video.completionCount ?? 0) + 1 : (video.completionCount ?? 0),
      trendingScore: computeTrendingScore({
        ...video,
        viewCount: (video.viewCount ?? 0) + 1,
        completionCount: completed ? (video.completionCount ?? 0) + 1 : (video.completionCount ?? 0),
      }),
      lastTrendingAt: now,
    });

    return { counted: true };
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
  args: { videoId: v.id("videos"), cursor: v.optional(v.string()), limit: v.optional(v.number()), token: v.optional(v.string()) },
  handler: async (ctx, { videoId, cursor, limit, token }) => {
    const video = await ctx.db.get(videoId);
    if (!video || video.status !== "published") {
      return { page: [], continueCursor: null, isDone: true };
    }
    const viewer = token ? await optionalUser(ctx, token) : null;
    const page = await ctx.db
      .query("comments")
      .withIndex("by_video_status_created", (q) =>
        q.eq("videoId", videoId).eq("status", "visible")
      )
      .order("desc")
      .paginate({ cursor: cursor ?? null, numItems: Math.min(limit ?? 30, 50) });

    // Sort pinned first
    const sorted = [...page.page].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAt - a.createdAt;
    });

    const authors = new Map();
    const hydrated = [];
    for (const comment of sorted) {
      let author = authors.get(comment.authorId);
      if (author === undefined) {
        author = await ctx.db.get(comment.authorId);
        authors.set(comment.authorId, author);
      }
      // Check if viewer liked this comment
      let likedByViewer = false;
      if (viewer) {
        const like = await ctx.db
          .query("commentLikes")
          .withIndex("by_comment_user", (q) => q.eq("commentId", comment._id).eq("userId", viewer._id))
          .unique();
        likedByViewer = Boolean(like);
      }
      // Get replies count
      const replies = await ctx.db
        .query("comments")
        .withIndex("by_parent", (q) => q.eq("parentCommentId", comment._id).eq("status", "visible"))
        .collect();
      hydrated.push({
        _id: comment._id,
        text: comment.text,
        createdAt: comment.createdAt,
        authorId: comment.authorId,
        parentCommentId: comment.parentCommentId ?? null,
        likeCount: comment.likeCount ?? 0,
        likedByViewer,
        pinned: comment.pinned ?? false,
        replyCount: replies.length,
        author: author
          ? { ...publicUser(author), avatarUrl: null }
          : { _id: comment.authorId, username: "deleted", displayName: "Deleted account" },
      });
    }
    // Resolve avatars
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

export const listCommentReplies = query({
  args: { parentCommentId: v.id("comments"), token: v.optional(v.string()) },
  handler: async (ctx, { parentCommentId, token }) => {
    const parent = await ctx.db.get(parentCommentId);
    if (!parent || parent.status !== "visible") return { replies: [] };
    const viewer = token ? await optionalUser(ctx, token) : null;
    const replies = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentCommentId", parentCommentId).eq("status", "visible"))
      .order("asc")
      .collect();
    const authors = new Map();
    const hydrated = [];
    for (const comment of replies) {
      let author = authors.get(comment.authorId);
      if (author === undefined) {
        author = await ctx.db.get(comment.authorId);
        authors.set(comment.authorId, author);
      }
      let likedByViewer = false;
      if (viewer) {
        const like = await ctx.db
          .query("commentLikes")
          .withIndex("by_comment_user", (q) => q.eq("commentId", comment._id).eq("userId", viewer._id))
          .unique();
        likedByViewer = Boolean(like);
      }
      let avatarUrl = null;
      if (author?.avatarStorageId) {
        try {
          avatarUrl = await ctx.storage.getUrl(author.avatarStorageId);
        } catch {
          avatarUrl = null;
        }
      }
      hydrated.push({
        _id: comment._id,
        text: comment.text,
        createdAt: comment.createdAt,
        authorId: comment.authorId,
        parentCommentId: comment.parentCommentId,
        likeCount: comment.likeCount ?? 0,
        likedByViewer,
        pinned: comment.pinned ?? false,
        author: author
          ? { ...publicUser(author), avatarUrl }
          : { _id: comment.authorId, username: "deleted", displayName: "Deleted account", avatarUrl: null },
      });
    }
    return { replies: hydrated };
  },
});

export const addComment = mutation({
  args: { token: v.string(), videoId: v.id("videos"), text: v.string(), parentCommentId: v.optional(v.id("comments")) },
  handler: async (ctx, { token, videoId, text, parentCommentId }) => {
    const viewer = await requireUser(ctx, token);
    const video = await getVideoOrThrow(ctx, videoId);
    const parsed = requireText(text, COMMENT_MAX, "Comment");
    if (parsed.error) throw badRequest(parsed.error);

    if (parentCommentId) {
      const parent = await ctx.db.get(parentCommentId);
      if (!parent || parent.videoId !== videoId || parent.status !== "visible") {
        throw notFound("Parent comment not found.");
      }
      // Prevent nesting beyond one level (replies to replies go to top-level parent)
      if (parent.parentCommentId) {
        // If parent is itself a reply, attach to its parent
        parentCommentId = parent.parentCommentId;
      }
    }

    const commentId = await ctx.db.insert("comments", {
      videoId,
      authorId: viewer._id,
      text: parsed.text,
      status: "visible",
      parentCommentId: parentCommentId ?? undefined,
      likeCount: 0,
      pinned: false,
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
        parentCommentId: parentCommentId ?? null,
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
    // Delete replies as well
    const replies = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentCommentId", commentId))
      .collect();
    for (const reply of replies) {
      await ctx.db.delete(reply._id);
      // Delete likes for reply
      for (const like of await ctx.db
        .query("commentLikes")
        .withIndex("by_comment_user", (q) => q.eq("commentId", reply._id))
        .collect()) {
        await ctx.db.delete(like._id);
      }
    }
    // Delete likes for this comment
    for (const like of await ctx.db
      .query("commentLikes")
      .withIndex("by_comment_user", (q) => q.eq("commentId", commentId))
      .collect()) {
      await ctx.db.delete(like._id);
    }
    await ctx.db.delete(commentId);
    const deletedCount = 1 + replies.length;
    await ctx.db.patch(video._id, { commentCount: Math.max(0, video.commentCount - deletedCount) });
    return { commentCount: Math.max(0, video.commentCount - deletedCount) };
  },
});

export const toggleCommentLike = mutation({
  args: { token: v.string(), commentId: v.id("comments") },
  handler: async (ctx, { token, commentId }) => {
    const viewer = await requireUser(ctx, token);
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.status !== "visible") throw notFound("Comment not found.");
    const existing = await ctx.db
      .query("commentLikes")
      .withIndex("by_comment_user", (q) => q.eq("commentId", commentId).eq("userId", viewer._id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(commentId, { likeCount: Math.max(0, (comment.likeCount ?? 0) - 1) });
      return { liked: false, likeCount: Math.max(0, (comment.likeCount ?? 0) - 1) };
    }
    await ctx.db.insert("commentLikes", {
      commentId,
      userId: viewer._id,
      createdAt: Date.now(),
    });
    await ctx.db.patch(commentId, { likeCount: (comment.likeCount ?? 0) + 1 });
    return { liked: true, likeCount: (comment.likeCount ?? 0) + 1 };
  },
});

export const pinComment = mutation({
  args: { token: v.string(), commentId: v.id("comments"), pinned: v.boolean() },
  handler: async (ctx, { token, commentId, pinned }) => {
    const viewer = await requireUser(ctx, token);
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.status !== "visible") throw notFound("Comment not found.");
    const video = await ctx.db.get(comment.videoId);
    if (!video) throw notFound("Video not found.");
    if (video.authorId !== viewer._id) throw forbidden("Only the video owner can pin comments.");
    if (comment.parentCommentId) throw badRequest("Only top-level comments can be pinned.");

    if (pinned) {
      // Unpin any existing pinned comments for this video (allow only 1 pinned for simplicity, or 3 max)
      const existingPinned = await ctx.db
        .query("comments")
        .withIndex("by_video_pinned", (q) => q.eq("videoId", comment.videoId).eq("pinned", true))
        .collect();
      for (const p of existingPinned) {
        if (p._id !== commentId) {
          await ctx.db.patch(p._id, { pinned: false });
        }
      }
    }

    await ctx.db.patch(commentId, { pinned });
    return { pinned };
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
      // Delete comment likes
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
      .withIndex("by_video_created", (q) => q.eq("videoId", videoId))
      .collect()) {
      await ctx.db.delete(view._id);
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
    if (video.captionFileStorageId) {
      try {
        await ctx.storage.delete(video.captionFileStorageId);
      } catch {}
    }
    const author = await ctx.db.get(viewer._id);
    if (author && author.videoCount > 0) {
      await ctx.db.patch(viewer._id, { videoCount: author.videoCount - 1 });
    }
    return { ok: true };
  },
});

export const getCategories = query({
  args: {},
  handler: async () => {
    return { categories: ["music", "gaming", "vlog", "education", "comedy", "tech", "sports", "news", "other"] };
  },
});

export const getTags = query({
  args: {},
  handler: async () => {
    return { tags: ["music", "gaming", "vlog", "education", "comedy", "tech", "sports", "news", "funny", "tutorial", "live", "travel", "food", "art", "fitness", "other"] };
  },
});
