import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { getErrorMessage } from "../lib/convex";
import { formatCount } from "../lib/format";
import { Link, useRouter } from "../lib/router";
import { Avatar, Button, EmptyState } from "../components/ui";
import { FollowButton } from "../components/user";
import { Comments } from "../components/comments";
import {
  IconComment,
  IconHeart,
  IconPlay,
  IconReels,
  IconTrash,
  IconVolumeHigh,
  IconVolumeMute,
} from "../components/icons";
import { cn } from "../utils/cn";

const PAGE_SIZE = 8;

export function ReelsPage({ startId }) {
  const { token, user: viewer } = useAuth();
  const scrollerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const result = usePaginatedQuery(api.videos.listReels, token ? { token } : "skip", {
    initialNumItems: PAGE_SIZE,
  });

  const reels = result?.results ?? [];

  useEffect(() => {
    if (!startId || !reels.length) return;
    const index = reels.findIndex((reel) => reel._id === startId);
    if (index < 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const slide = scroller.children[index];
    if (slide) {
      scroller.scrollTo({ top: slide.offsetTop, behavior: "auto" });
      setActiveIndex(index);
    }
  }, [startId, reels.length]);

  useEffect(() => {
    if (result?.status === "CanLoadMore" && activeIndex >= reels.length - 2) {
      result.loadMore(PAGE_SIZE);
    }
  }, [activeIndex, reels.length, result]);

  const goTo = useCallback(
    (index) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const next = Math.max(0, Math.min(reels.length - 1, index));
      const slide = scroller.children[next];
      if (slide) slide.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [reels.length]
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onScroll = () => {
      const height = scroller.clientHeight || 1;
      const index = Math.round(scroller.scrollTop / height);
      setActiveIndex((current) => (index === current ? current : index));
    };

    let wheelLock = false;
    const onWheel = (event) => {
      if (Math.abs(event.deltaY) < 18) return;
      event.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      goTo(activeIndex + (event.deltaY > 0 ? 1 : -1));
      setTimeout(() => {
        wheelLock = false;
      }, 420);
    };

    const onKey = (event) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable) return;
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        goTo(activeIndex + 1);
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        goTo(activeIndex - 1);
      }
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [activeIndex, goTo]);

  if (result === undefined || result.status === "LoadingFirstPage") {
    return (
      <div className="flex h-full items-center justify-center bg-black pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <span className="size-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <EmptyState
          icon={<IconReels className="size-5" />}
          title="No reels yet"
          description="Reels are short clips that live on this tab only. Upload one and it will appear here."
          action={
            <Link to="/upload">
              <Button size="sm">Upload a reel</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black">
      <div
        ref={scrollerRef}
        className="reels-scroller h-full overflow-y-auto"
        aria-label="Reels"
      >
        {reels.map((reel, index) => (
          <ReelSlide
            key={reel._id}
            reel={reel}
            active={index === activeIndex}
            neighbor={Math.abs(index - activeIndex) <= 1}
            viewerId={viewer?._id}
          />
        ))}
      </div>
      <p className="pointer-events-none absolute top-3 left-1/2 z-20 hidden -translate-x-1/2 text-[11px] font-medium tracking-wide text-white/50 uppercase lg:block">
        Swipe, scroll or use ↑ ↓
      </p>
    </div>
  );
}

function ReelSlide({ reel, active, neighbor, viewerId }) {
  const { token } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const videoRef = useRef(null);
  const toggleLike = useMutation(api.videos.toggleLike);
  const deleteVideo = useMutation(api.videos.deleteVideo);

  const [liked, setLiked] = useState(reel.likedByViewer);
  const [likeCount, setLikeCount] = useState(reel.likeCount);
  const [commentCount, setCommentCount] = useState(reel.commentCount);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [needsPlaybackGesture, setNeedsPlaybackGesture] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const lastTapRef = useRef(0);

  useEffect(() => {
    setLiked(reel.likedByViewer);
    setLikeCount(reel.likeCount);
    setCommentCount(reel.commentCount);
  }, [reel.likedByViewer, reel.likeCount, reel.commentCount]);

  useEffect(() => {
    const video = videoRef.current;
    if (!active) setNeedsPlaybackGesture(false);
    if (!video) return;
    let cancelled = false;
    video.muted = muted;
    if (active && !paused) {
      const play = video.play();
      if (play?.catch) {
        play
          .then(() => {
            if (!cancelled) setNeedsPlaybackGesture(false);
          })
          .catch((error) => {
            // Browsers may block autoplay with sound. Let the viewer start it;
            // do not silently switch the reel to muted playback.
            if (!cancelled && error?.name === "NotAllowedError") {
              setNeedsPlaybackGesture(true);
            }
          });
      }
    } else {
      video.pause();
      if (!active) video.currentTime = 0;
    }
    return () => {
      cancelled = true;
    };
  }, [active, paused, muted, reel.videoUrl]);

  function playWithSound() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    setPaused(false);
    // Call play directly from the user gesture so autoplay restrictions allow sound.
    video.play().then(() => setNeedsPlaybackGesture(false)).catch(() => {
      setNeedsPlaybackGesture(true);
    });
  }

  useEffect(() => {
    if (!active) setCommentsOpen(false);
  }, [active]);

  useEffect(() => {
    const onKey = (event) => {
      if (!active) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable) return;
      if (event.key === " ") {
        event.preventDefault();
        if (needsPlaybackGesture) playWithSound();
        else setPaused((value) => !value);
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        setMuted((value) => !value);
      } else if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        handleLike();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, liked, likeCount, token, needsPlaybackGesture]);

  async function handleLike() {
    if (!token) {
      toast.push("Sign in to like this reel.", "info");
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
    if (next) {
      setHeartBurst(true);
      setTimeout(() => setHeartBurst(false), 700);
    }
    try {
      const result = await toggleLike({ token, videoId: reel._id });
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (error) {
      setLiked(!next);
      setLikeCount((count) => Math.max(0, count + (next ? -1 : 1)));
      toast.push(getErrorMessage(error), "error");
    }
  }

  function handleTap() {
    if (needsPlaybackGesture) {
      playWithSound();
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      if (!liked) handleLike();
      else {
        setHeartBurst(true);
        setTimeout(() => setHeartBurst(false), 700);
      }
      return;
    }
    lastTapRef.current = now;
    setTimeout(() => {
      if (Date.now() - lastTapRef.current >= 260) setPaused((value) => !value);
    }, 280);
  }

  const isOwner = reel.author._id === viewerId;

  return (
    <section
      className={cn(
        "reels-slide relative flex h-full min-h-full w-full shrink-0 items-center justify-center overflow-hidden bg-black",
        active && "reels-slide-active"
      )}
      aria-label={reel.title}
    >
      {(active || neighbor) && reel.videoUrl ? (
        <video
          ref={videoRef}
          src={reel.videoUrl}
          poster={reel.thumbnailUrl || undefined}
          playsInline
          loop
          muted={muted}
          preload={active ? "auto" : "metadata"}
          className="h-full w-full object-contain"
          onClick={handleTap}
          onPlaying={() => setNeedsPlaybackGesture(false)}
        />
      ) : (
        <div className="h-full w-full bg-surface-900" />
      )}

      {active && needsPlaybackGesture && !paused ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/30">
          <button
            type="button"
            onClick={playWithSound}
            className="pointer-events-auto flex flex-col items-center gap-2 rounded-xl bg-black/70 px-5 py-4 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-black/85"
          >
            <IconPlay className="size-8" />
            Play with sound
          </button>
        </div>
      ) : null}

      {paused && active ? (
        <button
          type="button"
          onClick={() => setPaused(false)}
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
          aria-hidden="true"
        >
          <span className="grid size-16 place-items-center rounded-full bg-black/50 text-white">
            <IconPlay className="size-8 translate-x-0.5" />
          </span>
        </button>
      ) : null}

      {heartBurst ? (
        <span className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <IconHeart filled className="reel-heart-burst size-24 text-brand-500 drop-shadow-lg" />
        </span>
      ) : null}

      <div className="reels-meta pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pt-24 pb-6 sm:px-6">
        <div className="pointer-events-auto flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Link to={`/u/${reel.author.username}`} className="flex items-center gap-2.5">
              <Avatar user={reel.author} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">
                  {reel.author.displayName || reel.author.username}
                </span>
                <span className="block truncate text-xs text-white/60">@{reel.author.username}</span>
              </span>
            </Link>
            {!isOwner ? (
              <FollowButton userId={reel.author._id} following={reel.author?.isFollowing} />
            ) : null}
            <div>
              <p className="text-[15px] font-semibold text-white">{reel.title}</p>
              {reel.caption ? (
                <p className="mt-1 line-clamp-3 text-sm text-white/75">{reel.caption}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 pb-2">
            <button
              type="button"
              onClick={handleLike}
              className="flex flex-col items-center gap-1 text-white"
              aria-pressed={liked}
              aria-label={liked ? "Unlike" : "Like"}
            >
              <span
                className={cn(
                  "grid size-12 place-items-center rounded-full bg-white/10 backdrop-blur-sm transition",
                  liked && "text-brand-400"
                )}
              >
                <IconHeart filled={liked} className="size-6" />
              </span>
              <span className="text-xs font-semibold tabular-nums">{formatCount(likeCount)}</span>
            </button>

            <button
              type="button"
              onClick={() => setCommentsOpen(true)}
              className="flex flex-col items-center gap-1 text-white"
              aria-label="Comments"
            >
              <span className="grid size-12 place-items-center rounded-full bg-white/10 backdrop-blur-sm">
                <IconComment className="size-6" />
              </span>
              <span className="text-xs font-semibold tabular-nums">{formatCount(commentCount)}</span>
            </button>

            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              className="grid size-12 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <IconVolumeMute className="size-5" /> : <IconVolumeHigh className="size-5" />}
            </button>

            {isOwner ? (
              <button
                type="button"
                onClick={async () => {
                  if (!token) return;
                  try {
                    await deleteVideo({ token, videoId: reel._id });
                    toast.push("Reel deleted.", "success");
                    router.navigate("/reels");
                  } catch (error) {
                    toast.push(getErrorMessage(error), "error");
                  }
                }}
                className="grid size-12 place-items-center rounded-full bg-white/10 text-white/80 backdrop-blur-sm hover:text-red-300"
                aria-label="Delete reel"
              >
                <IconTrash className="size-5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {commentsOpen ? (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/50">
          <button
            type="button"
            className="flex-1"
            aria-label="Close comments"
            onClick={() => setCommentsOpen(false)}
          />
          <div className="max-h-[70%] overflow-y-auto rounded-t-2xl border-t border-line-600 bg-surface-900">
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 className="text-sm font-semibold text-zinc-100">Comments</h2>
              <button
                type="button"
                onClick={() => setCommentsOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100"
              >
                Close
              </button>
            </div>
            <Comments
              videoId={reel._id}
              open
              canModerate={isOwner}
              onCountChange={setCommentCount}
              className="px-4 py-4"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
