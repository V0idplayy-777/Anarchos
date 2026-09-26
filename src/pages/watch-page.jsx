import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { getErrorMessage } from "../lib/convex";
import { formatBytes, formatCount, timeAgo, formatDuration } from "../lib/format";
import { Link, useRouter } from "../lib/router";
import { CustomVideoPlayer } from "../components/custom-video-player";
import { FollowButton } from "../components/user";
import { Comments } from "../components/comments";
import { VideoGridCard } from "../components/video-grid-card";
import { Avatar, Button, Modal, Skeleton, Input, Textarea, Field } from "../components/ui";
import {
  IconHeart,
  IconShare,
  IconTrash,
  IconArrowLeft,
  IconEdit,
  IconEye,
  IconChart,
  IconCaption,
  IconTag,
  IconClose,
} from "../components/icons";
import { ErrorBoundary } from "../components/error-boundary";
import { cn } from "../utils/cn";

export function WatchPage({ videoId }) {
  const { token, user: viewer } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const toggleLike = useMutation(api.videos.toggleLike);
  const deleteVideo = useMutation(api.videos.deleteVideo);
  const updateVideo = useMutation(api.videos.updateVideo);
  const generateCaptionUploadUrl = useMutation(api.videos.generateCaptionUploadUrl);
  const recordView = useMutation(api.videos.recordView);
  const generateUploadUrl = useMutation(api.videos.generateUploadUrl);

  const video = useQuery(
    api.videos.getVideo,
    videoId ? { videoId, token: token || undefined } : "skip"
  );

  const publicVideo = useQuery(
    api.videos.getVideoPublic,
    !token && videoId ? { videoId } : "skip"
  );

  const effectiveVideo = token ? video : publicVideo ?? video;

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [showCaptionFull, setShowCaptionFull] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [hasRecordedView, setHasRecordedView] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAutoCaptions, setEditAutoCaptions] = useState("");
  const [editThumbnailFile, setEditThumbnailFile] = useState(null);
  const [editCaptionFile, setEditCaptionFile] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  const analytics = useQuery(
    api.videos.getVideoAnalytics,
    token && effectiveVideo && analyticsOpen ? { videoId: effectiveVideo._id, token } : "skip"
  );

  useEffect(() => {
    if (effectiveVideo?.kind === "reel") {
      router.replace(`/reels/${effectiveVideo._id}`);
    }
  }, [effectiveVideo, router]);

  // Sync like state
  useEffect(() => {
    if (effectiveVideo) {
      setLiked(effectiveVideo.likedByViewer);
      setLikeCount(effectiveVideo.likeCount);
      setCommentCount(effectiveVideo.commentCount);
      setEditTitle(effectiveVideo.title);
      setEditCaption(effectiveVideo.caption ?? "");
      setEditTags((effectiveVideo.tags ?? []).join(", "));
      setEditCategory(effectiveVideo.category ?? "");
      setEditAutoCaptions(effectiveVideo.autoCaptions ?? "");
    }
  }, [effectiveVideo]);

  // Share preview meta tags for guest viewing
  useEffect(() => {
    if (!effectiveVideo) return;
    const title = effectiveVideo.title;
    const desc = effectiveVideo.caption?.slice(0, 160) ?? "Watch on Anarchos";
    const thumb = effectiveVideo.thumbnailUrl;
    document.title = `${title} — Anarchos`;
    // Update meta tags
    const setMeta = (prop, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[property="${prop}"]`) || document.querySelector(`meta[name="${prop}"]`);
      if (!el) {
        el = document.createElement("meta");
        if (prop.startsWith("og:")) el.setAttribute("property", prop);
        else el.setAttribute("name", prop);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("og:title", title);
    setMeta("og:description", desc);
    if (thumb) setMeta("og:image", thumb);
    setMeta("description", desc);
    setMeta("twitter:card", "summary_large_image");
    if (thumb) setMeta("twitter:image", thumb);
  }, [effectiveVideo]);

  // Record view after 3s or 25% watched - handled via player? We'll use simple timer
  useEffect(() => {
    if (!effectiveVideo || hasRecordedView) return;
    const timer = setTimeout(() => {
      if (!hasRecordedView) {
        setHasRecordedView(true);
        const fp = typeof navigator !== "undefined" ? `${navigator.userAgent}-${effectiveVideo._id}`.slice(0, 100) : undefined;
        recordView({
          videoId: effectiveVideo._id,
          token: token || undefined,
          watchTimeSeconds: 3,
          completed: false,
          fingerprint: fp,
        }).catch(() => {});
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [effectiveVideo, hasRecordedView, token, recordView]);

  // Next / Related videos
  const moreVideos = usePaginatedQuery(
    api.videos.listFeed,
    token ? { token } : "skip",
    { initialNumItems: 8 }
  );

  const filteredMore = (moreVideos?.results ?? []).filter((v) => v._id !== videoId).slice(0, 6);

  async function handleLike() {
    if (!token) {
      toast.push("Sign in to like this video.", "info");
      return;
    }
    if (likeBusy || !effectiveVideo) return;
    const nextLiked = !liked;
    setLikeBusy(true);
    setLiked(nextLiked);
    setLikeCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
    try {
      const result = await toggleLike({ token, videoId: effectiveVideo._id });
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (error) {
      setLiked(!nextLiked);
      setLikeCount((c) => Math.max(0, c + (nextLiked ? -1 : 1)));
      toast.push(getErrorMessage(error), "error");
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.push("Link copied to clipboard. Title and thumbnail will show in previews.", "success");
      } else {
        toast.push(url, "info");
      }
    } catch {
      toast.push("Could not copy link.", "error");
    }
  }

  async function handleDelete() {
    if (!token || !effectiveVideo) return;
    setDeleting(true);
    try {
      await deleteVideo({ token, videoId: effectiveVideo._id });
      toast.push("Video deleted.", "success");
      setConfirmDelete(false);
      router.navigate("/");
    } catch (error) {
      toast.push(getErrorMessage(error), "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleEditSave() {
    if (!token || !effectiveVideo) return;
    setEditSaving(true);
    try {
      let thumbnailStorageId = undefined;
      if (editThumbnailFile) {
        const url = await generateUploadUrl({ token });
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": editThumbnailFile.type }, body: editThumbnailFile });
        if (!res.ok) throw new Error("Thumbnail upload failed");
        const { storageId } = await res.json();
        thumbnailStorageId = storageId;
      }
      let captionFileStorageId = undefined;
      if (editCaptionFile) {
        const url = await generateCaptionUploadUrl({ token });
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": editCaptionFile.type }, body: editCaptionFile });
        if (!res.ok) throw new Error("Caption upload failed");
        const { storageId } = await res.json();
        captionFileStorageId = storageId;
      }
      const tagsArray = editTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8);

      await updateVideo({
        token,
        videoId: effectiveVideo._id,
        title: editTitle,
        caption: editCaption || undefined,
        tags: tagsArray,
        category: editCategory || undefined,
        autoCaptions: editAutoCaptions || undefined,
        thumbnailStorageId,
        captionFileStorageId,
      });
      toast.push("Video updated.", "success");
      setEditOpen(false);
      setEditThumbnailFile(null);
      setEditCaptionFile(null);
    } catch (e) {
      toast.push(getErrorMessage(e), "error");
    } finally {
      setEditSaving(false);
    }
  }

  if (effectiveVideo === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-7 w-3/4" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (effectiveVideo === null) {
    return (
      <div className="card flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-zinc-100">Video not found</h2>
        <p className="max-w-sm text-sm text-zinc-400">
          This video may have been removed by the author or is no longer available.
        </p>
        <Button onClick={() => router.navigate("/")} variant="secondary">
          <IconArrowLeft className="size-4" />
          Back to Home
        </Button>
      </div>
    );
  }

  const isOwner = effectiveVideo.author._id === viewer?._id;
  const isGuest = !token;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-line-700/60">
            <CustomVideoPlayer
              src={effectiveVideo.videoUrl}
              poster={effectiveVideo.thumbnailUrl}
              title={effectiveVideo.title}
              autoPlay={true}
            />
            {/* Captions display */}
            {(effectiveVideo.captionFileUrl || effectiveVideo.autoCaptions) && (
              <div className="border-t border-line-700 bg-surface-900 px-4 py-2 text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <IconCaption className="size-4" />
                  <span>
                    {effectiveVideo.captionFileUrl ? "Subtitles available" : "Auto captions available"} — enable in player or edit
                  </span>
                  {effectiveVideo.captionFileUrl && (
                    <a href={effectiveVideo.captionFileUrl} target="_blank" rel="noreferrer" className="ml-auto text-brand-400 hover:underline">
                      Download .vtt
                    </a>
                  )}
                </div>
                {effectiveVideo.autoCaptions && (
                  <p className="mt-1 line-clamp-3 text-zinc-300">{effectiveVideo.autoCaptions}</p>
                )}
              </div>
            )}
          </div>

          <h1 className="text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">{effectiveVideo.title}</h1>

          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-700 pb-5">
            <div className="flex items-center gap-3.5">
              <Link to={`/u/${effectiveVideo.author.username}`} aria-label={`View ${effectiveVideo.author.username}'s profile`}>
                <Avatar user={effectiveVideo.author} size="md" />
              </Link>
              <div>
                <Link
                  to={`/u/${effectiveVideo.author.username}`}
                  className="block text-base font-semibold text-zinc-100 transition hover:text-white"
                >
                  {effectiveVideo.author.displayName || effectiveVideo.author.username}
                </Link>
                <p className="text-xs text-zinc-400">@{effectiveVideo.author.username}</p>
              </div>
              {!isOwner && !isGuest && (
                <div className="ml-2">
                  <FollowButton userId={effectiveVideo.author._id} following={effectiveVideo.author?.isFollowing} />
                </div>
              )}
              {isGuest && (
                <span className="ml-2 rounded-full bg-surface-800 px-2.5 py-1 text-xs text-zinc-400">Guest view — sign in to follow</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={liked ? "primary" : "secondary"}
                size="sm"
                onClick={handleLike}
                className={cn(liked && "border-brand-500 bg-brand-600 text-white")}
                aria-pressed={liked}
                title={isGuest ? "Sign in to like" : undefined}
              >
                <IconHeart filled={liked} className="size-4.5" />
                <span>{formatCount(likeCount)}</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={handleShare} title="Share video link">
                <IconShare className="size-4" />
                <span className="hidden sm:inline">Share</span>
              </Button>
              {isOwner && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)} title="Edit video">
                    <IconEdit className="size-4" />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setAnalyticsOpen(true)} title="View analytics">
                    <IconChart className="size-4" />
                    <span className="hidden sm:inline">Analytics</span>
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} title="Delete video">
                    <IconTrash className="size-4" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="card space-y-3 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 text-xs font-semibold text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <IconEye className="size-3.5" />
                {formatCount(effectiveVideo.viewCount ?? 0)} views
              </span>
              <span>•</span>
              <span>{timeAgo(effectiveVideo.createdAt)}</span>
              <span>•</span>
              <span>{formatBytes(effectiveVideo.sizeBytes)}</span>
              {effectiveVideo.durationSeconds ? (
                <>
                  <span>•</span>
                  <span>{formatDuration(effectiveVideo.durationSeconds)}</span>
                </>
              ) : null}
              {effectiveVideo.category && (
                <>
                  <span>•</span>
                  <span className="capitalize">{effectiveVideo.category}</span>
                </>
              )}
            </div>

            {effectiveVideo.tags && effectiveVideo.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {effectiveVideo.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-800 px-2.5 py-1 text-xs text-zinc-300">
                    <IconTag className="size-3" />#{t}
                  </span>
                ))}
              </div>
            )}

            {effectiveVideo.caption ? (
              <div className="text-sm leading-relaxed text-zinc-300">
                <p className={cn(!showCaptionFull && "line-clamp-3")}>{effectiveVideo.caption}</p>
                {effectiveVideo.caption.length > 180 && (
                  <button
                    type="button"
                    onClick={() => setShowCaptionFull(!showCaptionFull)}
                    className="mt-1 text-xs font-semibold text-brand-400 hover:underline"
                  >
                    {showCaptionFull ? "Show less" : "Read more"}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="card overflow-hidden">
            {isGuest ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium text-zinc-200">Sign in to comment</p>
                <p className="mt-1 text-xs text-zinc-500">Join Anarchos to join the conversation.</p>
              </div>
            ) : (
              <Comments videoId={effectiveVideo._id} open={true} canModerate={isOwner} onCountChange={setCommentCount} />
            )}
          </div>
        </div>

        <aside aria-label="Up next videos" className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">More to watch</h2>
          {filteredMore.length === 0 ? (
            <p className="text-xs text-zinc-500">No other videos yet.</p>
          ) : (
            <div className="space-y-4">
              {filteredMore.map((v) => (
                <ErrorBoundary key={v._id} resetKey={v._id}>
                  <VideoGridCard video={v} />
                </ErrorBoundary>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Delete Modal */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this video?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>
              Permanently delete
            </Button>
          </>
        }
      >
        <p>“{effectiveVideo.title}” and its stored media will be permanently removed. This action cannot be undone.</p>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit video"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button loading={editSaving} onClick={handleEditSave}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" htmlFor="edit-title">
            <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Description" htmlFor="edit-caption">
            <Textarea id="edit-caption" value={editCaption} onChange={(e) => setEditCaption(e.target.value)} rows={4} maxLength={800} />
          </Field>
          <Field label="Tags (comma separated)" hint="e.g. music, gaming, vlog">
            <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="music, comedy" />
          </Field>
          <Field label="Category">
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="w-full rounded-lg border border-line-600 bg-surface-850 px-3 py-2 text-sm"
            >
              <option value="">No category</option>
              <option value="music">Music</option>
              <option value="gaming">Gaming</option>
              <option value="vlog">Vlog</option>
              <option value="education">Education</option>
              <option value="comedy">Comedy</option>
              <option value="tech">Tech</option>
              <option value="sports">Sports</option>
              <option value="news">News</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Auto captions (editable)" hint="Text captions that make reels useful without audio">
            <Textarea value={editAutoCaptions} onChange={(e) => setEditAutoCaptions(e.target.value)} rows={3} maxLength={5000} placeholder="Enter captions..." />
          </Field>
          <Field label="Replace thumbnail" hint="JPG/PNG up to 8MB">
            <Input type="file" accept="image/*" onChange={(e) => setEditThumbnailFile(e.target.files?.[0] ?? null)} />
            {editThumbnailFile && <p className="text-xs text-zinc-400">{editThumbnailFile.name}</p>}
          </Field>
          <Field label="Upload subtitle file" hint="VTT or SRT, up to 2MB, improves accessibility">
            <Input type="file" accept=".vtt,.srt,text/vtt,text/plain" onChange={(e) => setEditCaptionFile(e.target.files?.[0] ?? null)} />
            {editCaptionFile && <p className="text-xs text-zinc-400">{editCaptionFile.name}</p>}
            {effectiveVideo.captionFileUrl && !editCaptionFile && (
              <p className="text-xs text-zinc-500">
                Current: <a href={effectiveVideo.captionFileUrl} target="_blank" rel="noreferrer" className="text-brand-400 underline">view file</a>
              </p>
            )}
          </Field>
        </div>
      </Modal>

      {/* Analytics Modal */}
      <Modal
        open={analyticsOpen}
        onClose={() => setAnalyticsOpen(false)}
        title="Video analytics"
        footer={
          <Button variant="ghost" onClick={() => setAnalyticsOpen(false)}>
            Close
          </Button>
        }
      >
        {analytics === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : analytics === null ? (
          <p className="text-sm text-zinc-400">No analytics yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface-850 p-3">
                <p className="text-xs text-zinc-500">Genuine views</p>
                <p className="text-lg font-semibold text-zinc-100">{formatCount(analytics.viewCount)}</p>
                <p className="mt-1 text-[11px] text-zinc-500">{analytics.definition}</p>
              </div>
              <div className="rounded-lg bg-surface-850 p-3">
                <p className="text-xs text-zinc-500">Avg watch time</p>
                <p className="text-lg font-semibold text-zinc-100">{formatDuration(Math.round(analytics.avgWatchTimeSeconds)) || "0:00"}</p>
              </div>
              <div className="rounded-lg bg-surface-850 p-3">
                <p className="text-xs text-zinc-500">Completion rate</p>
                <p className="text-lg font-semibold text-zinc-100">{analytics.completionRate.toFixed(1)}%</p>
                <p className="text-xs text-zinc-500">{analytics.completionCount} completions</p>
              </div>
              <div className="rounded-lg bg-surface-850 p-3">
                <p className="text-xs text-zinc-500">Engagement</p>
                <p className="text-sm text-zinc-200">{formatCount(analytics.likeCount)} likes</p>
                <p className="text-sm text-zinc-200">{formatCount(analytics.commentCount)} comments</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-zinc-300">Views last 7 days</p>
              <div className="flex items-end gap-1">
                {analytics.dailyViews.map((d) => {
                  const max = Math.max(...analytics.dailyViews.map((x) => x.count), 1);
                  const h = (d.count / max) * 40 + 4;
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full rounded bg-brand-600" style={{ height: h }} title={`${d.date}: ${d.count}`} />
                      <span className="text-[9px] text-zinc-500">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
