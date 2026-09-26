import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Anarchos data model.
 *
 * Notes on design:
 * - `users.username` is the normalized (lowercase) handle and is the canonical
 *   unique identity used for lookups and profile URLs.
 * - Counts that would otherwise require full scans (followers, following,
 *   videos, likes, comments) are maintained transactionally inside the same
 *   mutation that creates/removes the underlying record, so they can never
 *   drift and can never be set by the client.
 * - Media lives in Convex file storage; database documents only keep the
 *   storage id plus metadata.
 * - `status` fields exist so moderation can be layered on later without a
 *   schema redesign.
 */
export default defineSchema({
  users: defineTable({
    username: v.string(), // normalized: lowercase, no spaces
    displayName: v.optional(v.string()),
    searchName: v.optional(v.string()), // lowercased display name, for prefix search
    bio: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    passwordHash: v.string(),
    followerCount: v.number(),
    followingCount: v.number(),
    videoCount: v.number(),
    status: v.string(), // "active" | "deleted"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_username", ["username"])
    .index("by_search_name", ["searchName"])
    .index("by_status", ["status"]),

  sessions: defineTable({
    token: v.string(),
    userId: v.id("users"),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId", "expiresAt"]),

  videos: defineTable({
    storageId: v.id("_storage"),
    thumbnailStorageId: v.optional(v.id("_storage")),
    durationSeconds: v.optional(v.number()),
    authorId: v.id("users"),
    title: v.string(),
    titleSearch: v.optional(v.string()), // lowercased title for search
    caption: v.optional(v.string()),
    captionSearch: v.optional(v.string()), // lowercased caption
    contentType: v.string(),
    sizeBytes: v.number(),
    likeCount: v.number(),
    commentCount: v.number(),
    status: v.string(), // "published" | "removed"
    kind: v.optional(v.string()), // "video" | "reel" — missing treated as "video"
    // Tags / Categories
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    // Captions
    captionFileStorageId: v.optional(v.id("_storage")),
    autoCaptions: v.optional(v.string()),
    // Analytics
    viewCount: v.optional(v.number()),
    totalWatchTimeSeconds: v.optional(v.number()),
    completionCount: v.optional(v.number()),
    // For trending score cache (optional)
    trendingScore: v.optional(v.number()),
    lastTrendingAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_author_created", ["authorId", "createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_kind_status_created", ["kind", "status", "createdAt"])
    .index("by_category", ["category", "status", "createdAt"])
    .index("by_viewCount", ["status", "viewCount"])
    .index("by_trending", ["status", "trendingScore"]),

  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_follower_following", ["followerId", "followingId"])
    .index("by_following_follower", ["followingId", "followerId"]),

  likes: defineTable({
    videoId: v.id("videos"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_video_user", ["videoId", "userId"])
    .index("by_user_created", ["userId", "createdAt"]),

  comments: defineTable({
    videoId: v.id("videos"),
    authorId: v.id("users"),
    text: v.string(),
    status: v.string(), // "visible" | "removed"
    // Replies & pinning
    parentCommentId: v.optional(v.id("comments")),
    likeCount: v.optional(v.number()),
    pinned: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_video_status_created", ["videoId", "status", "createdAt"])
    .index("by_author_created", ["authorId", "createdAt"])
    .index("by_parent", ["parentCommentId", "status", "createdAt"])
    .index("by_video_pinned", ["videoId", "pinned"]),

  commentLikes: defineTable({
    commentId: v.id("comments"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_comment_user", ["commentId", "userId"])
    .index("by_user_created", ["userId", "createdAt"]),

  conversations: defineTable({
    // userA.id is always the lexicographically smaller id so the pair is unique
    userA: v.id("users"),
    userB: v.id("users"),
    lastMessageAt: v.number(),
    lastMessageText: v.optional(v.string()),
    lastMessageSenderId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_participants", ["userA", "userB"])
    .index("by_userA", ["userA", "lastMessageAt"])
    .index("by_userB", ["userB", "lastMessageAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    text: v.string(),
    status: v.string(), // "visible" | "removed"
    createdAt: v.number(),
  })
    .index("by_conversation_created", ["conversationId", "createdAt"])
    .index("by_sender", ["senderId"]),

  videoViews: defineTable({
    videoId: v.id("videos"),
    userId: v.optional(v.id("users")),
    // For anonymous views we store a fingerprint hash if provided
    fingerprint: v.optional(v.string()),
    watchTimeSeconds: v.optional(v.number()),
    completed: v.optional(v.boolean()),
    // To filter obvious repeated / automated activity, we store ip-like key? Use fingerprint + time window
    createdAt: v.number(),
  })
    .index("by_video_created", ["videoId", "createdAt"])
    .index("by_video_user", ["videoId", "userId"])
    .index("by_user_created", ["userId", "createdAt"]),

  // Login / signup throttling so credential stuffing is not free.
  authAttempts: defineTable({
    key: v.string(),
    count: v.number(),
    lastAttemptAt: v.number(),
    lockedUntil: v.optional(v.number()),
  }).index("by_key", ["key"]),
});
