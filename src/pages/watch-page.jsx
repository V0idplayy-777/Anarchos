import { useState, useEffect } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { getErrorMessage } from "../lib/convex";
import { formatBytes, formatCount, timeAgo } from "../lib/format";
import { Link, useRouter } from "../lib/router";
import { CustomVideoPlayer } from "../components/custom-video-player";
import { FollowButton } from "../components/user";
import { Comments } from "../components/comments";
import { VideoGridCard } from "../components/video-grid-card";
import { Avatar, Button, Modal, Skeleton } from "../components/ui";
import { IconHeart, IconShare, IconTrash, IconArrowLeft } from "../components/icons";
import { ErrorBoundary } from "../components/error-boundary";
import { cn } from "../utils/cn";

export function WatchPage({ videoId }) {
  const { token, user: viewer } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const toggleLike = useMutation(api.videos.toggleLike);
  const deleteVideo = useMutation(api.videos.deleteVideo);

  const video = useQuery(
    api.videos.getVideo,
    videoId ? { videoId, token: token || undefined } : "skip"
  );

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [showCaptionFull, setShowCaptionFull] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (video?.kind === "reel") {
      router.replace(`/reels/${video._id}`);
    }
  }, [video, router]);

  // Sync like state from backend query
  useEffect(() => {
    if (video) {
      setLiked(video.likedByViewer);
      setLikeCount(video.likeCount);
      setCommentCount(video.commentCount);
    }
  }, [video]);

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
    if (likeBusy || !video) return;

    const nextLiked = !liked;
    setLikeBusy(true);
    setLiked(nextLiked);
    setLikeCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));

    try {
      const result = await toggleLike({ token, videoId: video._id });
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
        toast.push("Link copied to clipboard.", "success");
      } else {
        toast.push(url, "info");
      }
    } catch {
      toast.push("Could not copy link.", "error");
    }
  }

  async function handleDelete() {
    if (!token || !video) return;
    setDeleting(true);
    try {
      await deleteVideo({ token, videoId: video._id });
      toast.push("Video deleted.", "success");
      setConfirmDelete(false);
      router.navigate("/");
    } catch (error) {
      toast.push(getErrorMessage(error), "error");
    } finally {
      setDeleting(false);
    }
  }

  if (video === undefined) {
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

  if (video === null) {
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

  const isOwner = video.author._id === viewer?._id;

  return (
    <div className="space-y-8">
      {/* Top Main Column & Sidebar Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left 2 Columns: Video & Primary Details */}
        <div className="space-y-5 lg:col-span-2">
          {/* Custom Video Player with Autoplay */}
          <div className="overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-line-700/60">
            <CustomVideoPlayer
              src={video.videoUrl}
              poster={video.thumbnailUrl}
              title={video.title}
              autoPlay={true}
            />
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">
            {video.title}
          </h1>

          {/* Author & Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-700 pb-5">
            {/* Author details */}
            <div className="flex items-center gap-3.5">
              <Link to={`/u/${video.author.username}`} aria-label={`View ${video.author.username}'s profile`}>
                <Avatar user={video.author} size="md" />
              </Link>
              <div>
                <Link
                  to={`/u/${video.author.username}`}
                  className="block text-base font-semibold text-zinc-100 transition hover:text-white"
                >
                  {video.author.displayName || video.author.username}
                </Link>
                <p className="text-xs text-zinc-400">@{video.author.username}</p>
              </div>

              {!isOwner && (
                <div className="ml-2">
                  <FollowButton
                    userId={video.author._id}
                    following={video.author?.isFollowing}
                  />
                </div>
              )}
            </div>

            {/* Action buttons: Like, Share, Delete */}
            <div className="flex items-center gap-2">
              <Button
                variant={liked ? "primary" : "secondary"}
                size="sm"
                onClick={handleLike}
                className={cn(liked && "border-brand-500 bg-brand-600 text-white")}
                aria-pressed={liked}
              >
                <IconHeart filled={liked} className="size-4.5" />
                <span>{formatCount(likeCount)}</span>
              </Button>

              <Button variant="secondary" size="sm" onClick={handleShare} title="Share video link">
                <IconShare className="size-4" />
                <span className="hidden sm:inline">Share</span>
              </Button>

              {isOwner && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  title="Delete video"
                >
                  <IconTrash className="size-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              )}
            </div>
          </div>

          {/* Caption & Metadata card */}
          <div className="card space-y-2.5 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 text-xs font-semibold text-zinc-400">
              <span>{timeAgo(video.createdAt)}</span>
              <span>•</span>
              <span>{formatBytes(video.sizeBytes)}</span>
              {video.contentType && (
                <>
                  <span>•</span>
                  <span>{video.contentType}</span>
                </>
              )}
            </div>

            {video.caption ? (
              <div className="text-sm leading-relaxed text-zinc-300">
                <p className={cn(!showCaptionFull && "line-clamp-3")}>{video.caption}</p>
                {video.caption.length > 180 && (
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

          {/* Comments Section */}
          <div className="card overflow-hidden">
            <Comments
              videoId={video._id}
              open={true}
              canModerate={isOwner}
              onCountChange={setCommentCount}
            />
          </div>
        </div>

        {/* Right Column: Up Next / More Videos */}
        <aside aria-label="Up next videos" className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
            More to watch
          </h2>

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

      {/* Delete Confirmation Modal */}
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
        <p>
          “{video.title}” and its stored media will be permanently removed. This action cannot be
          undone.
        </p>
      </Modal>
    </div>
  );
}
