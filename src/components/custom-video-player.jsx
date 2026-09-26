import { useEffect, useRef, useState, useCallback } from "react";
import { formatDuration } from "../lib/format";
import {
  IconPlay,
  IconPause,
  IconVolumeHigh,
  IconVolumeLow,
  IconVolumeMute,
  IconFullscreen,
  IconExitFullscreen,
  IconBack5,
  IconForward5,
  IconPip,
  IconAlert,
} from "./icons";
import { Button } from "./ui";
import { cn } from "../utils/cn";

export function CustomVideoPlayer({
  src,
  poster,
  title,
  autoPlay = true,
  className,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const progressBarRef = useRef(null);
  const hideControlsTimerRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(0);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [error, setError] = useState(null);
  const [autoplayBlockedMuted, setAutoplayBlockedMuted] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const actionNoticeTimerRef = useRef(null);

  const triggerActionNotice = useCallback((icon, text) => {
    if (actionNoticeTimerRef.current) clearTimeout(actionNoticeTimerRef.current);
    setActionNotice({ icon, text, key: Date.now() });
    actionNoticeTimerRef.current = setTimeout(() => {
      setActionNotice(null);
    }, 600);
  }, []);

  // Autoplay handler with audio / fallback to muted autoplay
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    setIsEnded(false);

    if (autoPlay) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            // Unmuted autoplay blocked by browser policy -> try muted autoplay
            if (err.name === "NotAllowedError") {
              video.muted = true;
              setIsMuted(true);
              setAutoplayBlockedMuted(true);
              video
                .play()
                .then(() => setIsPlaying(true))
                .catch(() => setIsPlaying(false));
            } else {
              setIsPlaying(false);
            }
          });
      }
    }
  }, [src, autoPlay]);

  // Fullscreen change listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  // Auto-hide controls
  const resetHideControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isPlaying && !showSpeedMenu && !isDraggingProgress) {
      hideControlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }, [isPlaying, showSpeedMenu, isDraggingProgress]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isEnded) {
      video.currentTime = 0;
      video.play();
      setIsPlaying(true);
      setIsEnded(false);
      triggerActionNotice("play", "Play");
      return;
    }

    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
        triggerActionNotice("play", "Play");
      });
    } else {
      video.pause();
      setIsPlaying(false);
      setShowControls(true);
      triggerActionNotice("pause", "Pause");
    }
  }, [isEnded, triggerActionNotice]);

  const seekBy = useCallback(
    (seconds) => {
      const video = videoRef.current;
      if (!video) return;
      const target = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
      video.currentTime = target;
      setCurrentTime(target);
      triggerActionNotice(
        seconds > 0 ? "forward" : "backward",
        `${seconds > 0 ? "+" : ""}${seconds}s`
      );
    },
    [triggerActionNotice]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    setAutoplayBlockedMuted(false);
    triggerActionNotice(nextMuted ? "mute" : "unmute", nextMuted ? "Muted" : "Unmuted");
  }, [triggerActionNotice]);

  const handleVolumeChange = useCallback(
    (newVolume) => {
      const video = videoRef.current;
      if (!video) return;
      const clamped = Math.max(0, Math.min(1, newVolume));
      video.volume = clamped;
      setVolume(clamped);
      if (clamped === 0) {
        video.muted = true;
        setIsMuted(true);
      } else if (video.muted) {
        video.muted = false;
        setIsMuted(false);
      }
      setAutoplayBlockedMuted(false);
    },
    []
  );

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      try {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          await container.webkitRequestFullscreen();
        }
      } catch {
        /* fullscreen denied */
      }
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch {
      /* pip not supported/allowed */
    }
  }, []);

  const changeSpeed = useCallback((speed) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  }, []);

  // Keyboard controls when container is focused or active
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input or textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable) {
        return;
      }

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
        case "j":
        case "J":
          e.preventDefault();
          seekBy(-5);
          break;
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          seekBy(5);
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeChange(volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange(volume - 0.1);
          break;
        case "m":
        case "M":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, seekBy, handleVolumeChange, volume, toggleMute, toggleFullscreen]);

  // Video event handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isDraggingProgress) return;
    setCurrentTime(video.currentTime);

    // Buffer percentage
    if (video.buffered.length > 0) {
      try {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const percent = (bufferedEnd / video.duration) * 100;
        setBufferedPercent(Math.min(100, percent));
      } catch {
        /* ignore */
      }
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
  };

  // Seek bar interaction
  const getProgressTimeFromEvent = (e) => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return pos * duration;
  };

  const handleProgressMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingProgress(true);
    const time = getProgressTimeFromEvent(e);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }

    const onMouseMove = (moveEvent) => {
      const moveTime = getProgressTimeFromEvent(moveEvent);
      setCurrentTime(moveTime);
      if (videoRef.current) {
        videoRef.current.currentTime = moveTime;
      }
    };

    const onMouseUp = () => {
      setIsDraggingProgress(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleProgressMouseMove = (e) => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * duration);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error || !src) {
    return (
      <div
        className={cn(
          "flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-line-700 bg-surface-900 px-6 text-center shadow-xl",
          className
        )}
      >
        <div className="grid size-12 place-items-center rounded-full bg-brand-600/20 text-brand-400">
          <IconAlert className="size-6" />
        </div>
        <p className="text-base font-semibold text-zinc-100">Unable to play video</p>
        <p className="max-w-md text-sm text-zinc-400">
          The video stream is unavailable or failed to decode.
        </p>
        {src && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setError(null);
              if (videoRef.current) {
                videoRef.current.load();
                videoRef.current.play();
              }
            }}
          >
            Retry playback
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideControlsTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className={cn(
        "group relative flex aspect-video w-full flex-col justify-end overflow-hidden rounded-xl bg-black select-none shadow-2xl",
        isFullscreen ? "h-screen w-screen rounded-none" : "",
        className
      )}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="auto"
        className="size-full bg-black object-contain cursor-pointer"
        onClick={togglePlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
          setIsEnded(false);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setIsEnded(true);
          setShowControls(true);
        }}
        onError={() => setError("Failed to play video.")}
      />

      {/* Autoplay muted banner notice */}
      {autoplayBlockedMuted && (
        <button
          type="button"
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.muted = false;
              setIsMuted(false);
              setAutoplayBlockedMuted(false);
            }
          }}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-brand-600 hover:scale-105"
        >
          <IconVolumeMute className="size-4 text-brand-400" />
          <span>Click to unmute</span>
        </button>
      )}

      {/* Center Action Splash (Play / Pause / Rewind / Forward flash) */}
      {actionNotice && (
        <div
          key={actionNotice.key}
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center animate-fade-out"
        >
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-black/75 px-5 py-4 text-white shadow-2xl backdrop-blur">
            {actionNotice.icon === "play" && <IconPlay className="size-10 translate-x-0.5 text-brand-400" />}
            {actionNotice.icon === "pause" && <IconPause className="size-10 text-zinc-100" />}
            {actionNotice.icon === "forward" && <IconForward5 className="size-10 text-brand-400" />}
            {actionNotice.icon === "backward" && <IconBack5 className="size-10 text-brand-400" />}
            {actionNotice.icon === "mute" && <IconVolumeMute className="size-10 text-zinc-300" />}
            {actionNotice.icon === "unmute" && <IconVolumeHigh className="size-10 text-brand-400" />}
            <span className="text-xs font-semibold">{actionNotice.text}</span>
          </div>
        </div>
      )}

      {/* Center Buffering Spinner */}
      {isBuffering && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
          <div className="size-12 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      )}

      {/* Video ended overlay */}
      {isEnded && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-[2px]">
          <button
            type="button"
            onClick={togglePlay}
            className="group/replay grid size-16 place-items-center rounded-full bg-brand-600 text-white shadow-lg transition hover:scale-110 hover:bg-brand-500"
            aria-label="Replay video"
          >
            <IconPlay className="size-7 translate-x-0.5" />
          </button>
          <p className="text-sm font-medium text-zinc-200">Replay</p>
        </div>
      )}

      {/* Gradient Vignette for control bar */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300",
          showControls || !isPlaying ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Bottom Control Bar */}
      <div
        className={cn(
          "relative z-30 flex flex-col gap-2 px-3 pb-3 pt-2 transition-all duration-300 sm:px-4 sm:pb-3.5",
          showControls || !isPlaying
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        )}
      >
        {/* Seek / Progress Bar */}
        <div
          ref={progressBarRef}
          onMouseDown={handleProgressMouseDown}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={() => setHoverTime(null)}
          className="group/seek relative flex h-4 w-full cursor-pointer items-center"
        >
          {/* Hover Time Tooltip */}
          {hoverTime !== null && (
            <div
              className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded bg-surface-900/95 px-2 py-0.5 text-xs font-semibold text-zinc-100 shadow-lg ring-1 ring-white/10 backdrop-blur"
              style={{ left: `${hoverPosition}%` }}
            >
              {formatDuration(hoverTime)}
            </div>
          )}

          {/* Track Background */}
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-all duration-150 group-hover/seek:h-2">
            {/* Buffered Track */}
            <div
              className="absolute inset-y-0 left-0 bg-white/30 transition-all duration-200"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Played Track (Red Brand Accent) */}
            <div
              className="absolute inset-y-0 left-0 bg-brand-500 transition-[width] duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Scrubber Knob */}
          <div
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full bg-brand-400 shadow-md ring-2 ring-white/80 transition-transform duration-100 group-hover/seek:scale-125"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Buttons and metadata row */}
        <div className="flex items-center justify-between gap-2 text-white">
          {/* Left Controls: Play, Skip 5s, Volume, Timestamps */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="grid size-9 place-items-center rounded-lg text-zinc-200 transition hover:bg-white/15 hover:text-white"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <IconPause className="size-5" /> : <IconPlay className="size-5 translate-x-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => seekBy(-5)}
              className="hidden size-8 place-items-center rounded-lg text-zinc-300 transition hover:bg-white/15 hover:text-white sm:grid"
              aria-label="Rewind 5 seconds"
              title="Rewind 5s (Left Arrow / J)"
            >
              <IconBack5 className="size-4.5" />
            </button>

            <button
              type="button"
              onClick={() => seekBy(5)}
              className="hidden size-8 place-items-center rounded-lg text-zinc-300 transition hover:bg-white/15 hover:text-white sm:grid"
              aria-label="Forward 5 seconds"
              title="Forward 5s (Right Arrow / L)"
            >
              <IconForward5 className="size-4.5" />
            </button>

            {/* Volume Control */}
            <div className="group/vol flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className="grid size-8 place-items-center rounded-lg text-zinc-300 transition hover:bg-white/15 hover:text-white"
                aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
                title="Mute / Unmute (M)"
              >
                {isMuted || volume === 0 ? (
                  <IconVolumeMute className="size-5 text-zinc-400" />
                ) : volume < 0.5 ? (
                  <IconVolumeLow className="size-5" />
                ) : (
                  <IconVolumeHigh className="size-5" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                aria-label="Volume slider"
                className="h-1 w-14 accent-brand-500 cursor-pointer transition-all sm:w-20"
              />
            </div>

            {/* Timestamp */}
            <div className="ml-1 text-xs font-medium tabular-nums text-zinc-300">
              <span>{formatDuration(currentTime) || "0:00"}</span>
              <span className="mx-1 text-zinc-500">/</span>
              <span>{formatDuration(duration) || "0:00"}</span>
            </div>
          </div>

          {/* Right Controls: Speed, PiP, Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Playback speed selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex h-8 items-center rounded-lg px-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/15 hover:text-white"
                aria-label="Playback speed"
                title="Playback speed"
              >
                {playbackSpeed === 1 ? "1x" : `${playbackSpeed}x`}
              </button>

              {showSpeedMenu && (
                <div className="absolute right-0 bottom-full mb-2 flex flex-col rounded-xl border border-line-600 bg-surface-900/95 py-1.5 shadow-2xl backdrop-blur">
                  <span className="px-3 py-1 text-[11px] font-semibold text-zinc-400">Speed</span>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => changeSpeed(s)}
                      className={cn(
                        "flex items-center justify-between gap-4 px-3 py-1.5 text-xs transition hover:bg-surface-800",
                        playbackSpeed === s ? "font-semibold text-brand-400" : "text-zinc-200"
                      )}
                    >
                      <span>{s === 1 ? "Normal (1x)" : `${s}x`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picture in picture */}
            {typeof document !== "undefined" && "pictureInPictureEnabled" in document && (
              <button
                type="button"
                onClick={togglePip}
                className="hidden size-8 place-items-center rounded-lg text-zinc-300 transition hover:bg-white/15 hover:text-white sm:grid"
                aria-label="Picture in picture"
                title="Picture in picture"
              >
                <IconPip className="size-4.5" />
              </button>
            )}

            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="grid size-8 place-items-center rounded-lg text-zinc-300 transition hover:bg-white/15 hover:text-white"
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <IconExitFullscreen className="size-4.5" />
              ) : (
                <IconFullscreen className="size-4.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
