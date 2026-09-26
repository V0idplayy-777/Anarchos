import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../../convex/_generated/api";
import { http, getErrorMessage } from "../lib/convex";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { uploadToConvex } from "../lib/upload";
import { formatBytes, formatDuration } from "../lib/format";
import { useRouter } from "../lib/router";
import { Button, Field, Input, PageHeader, Textarea } from "../components/ui";
import { IconAlert, IconCamera, IconClose, IconPlay, IconReels, IconUpload } from "../components/icons";
import { cn } from "../utils/cn";

const MAX_BYTES = 100 * 1024 * 1024;
const TITLE_MAX = 100;
const CAPTION_MAX = 800;

export function UploadPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const videoInputRef = useRef(null);
  const thumbInputRef = useRef(null);
  const previewVideoRef = useRef(null);
  const abortRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);

  // Thumbnail state:
  const [thumbnailFile, setThumbnailFile] = useState(null); // File or Blob
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState(null);
  const [isCustomThumbnail, setIsCustomThumbnail] = useState(false);

  const [kind, setKind] = useState("video");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | uploading | publishing | done
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState(null);
  const [published, setPublished] = useState(null);
  const [dragging, setDragging] = useState(false);

  // Sync video object URL
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setVideoDuration(0);
      setThumbnailFile(null);
      setThumbnailPreviewUrl(null);
      setIsCustomThumbnail(false);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Sync thumbnail preview URL
  useEffect(() => {
    if (!thumbnailFile) {
      setThumbnailPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(thumbnailFile);
    setThumbnailPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnailFile]);

  // Capture frame from video element
  const captureFrame = useCallback((videoElement) => {
    if (!videoElement || videoElement.videoWidth === 0) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const thumb = new File([blob], "thumbnail.jpg", { type: "image/jpeg" });
              resolve(thumb);
            } else {
              resolve(null);
            }
          },
          "image/jpeg",
          0.88
        );
      });
    } catch {
      return null;
    }
  }, []);

  const handleVideoLoadedMetadata = async () => {
    const video = previewVideoRef.current;
    if (!video) return;
    setVideoDuration(video.duration || 0);

    // Seek slightly into the video for an auto-generated thumbnail
    if (!isCustomThumbnail) {
      video.currentTime = Math.min(1, (video.duration || 0) * 0.2);
    }
  };

  const handleVideoSeeked = async () => {
    const video = previewVideoRef.current;
    if (!video || isCustomThumbnail || thumbnailFile) return;
    const thumb = await captureFrame(video);
    if (thumb && !isCustomThumbnail) {
      setThumbnailFile(thumb);
    }
  };

  const handleCaptureCurrentFrame = async () => {
    const video = previewVideoRef.current;
    if (!video) return;
    const thumb = await captureFrame(video);
    if (thumb) {
      setThumbnailFile(thumb);
      setIsCustomThumbnail(true);
      toast.push("Captured frame as thumbnail.", "success");
    }
  };

  function acceptVideoFile(next) {
    setError(null);
    if (!next) return;
    if (!next.type.startsWith("video/")) {
      setError("That file is not a video. Use an MP4, WebM or MOV file.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(`That file is ${formatBytes(next.size)}. The limit is 100 MB.`);
      return;
    }
    if (next.size === 0) {
      setError("That file is empty.");
      return;
    }
    setFile(next);
    if (!title.trim()) {
      setTitle(next.name.replace(/\.[a-z0-9]+$/i, "").slice(0, TITLE_MAX));
    }
  }

  function acceptThumbnailFile(next) {
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      toast.push("Thumbnails must be image files (JPG, PNG, WebP).", "error");
      return;
    }
    if (next.size > 8 * 1024 * 1024) {
      toast.push("Thumbnails must be 8 MB or smaller.", "error");
      return;
    }
    setThumbnailFile(next);
    setIsCustomThumbnail(true);
    toast.push("Custom thumbnail selected.", "success");
  }

  async function handlePublish() {
    if (!file) {
      setError("Choose a video file to upload.");
      return;
    }
    if (!title.trim()) {
      setError("Add a title so people know what they are watching.");
      return;
    }
    setError(null);
    setProgress(0);
    setPhase("uploading");
    setStatusMessage("Uploading video file…");

    try {
      // 1. Upload Video
      const videoUploadUrl = await http.mutation(api.videos.generateUploadUrl, { token });
      const storedVideo = await uploadToConvex(videoUploadUrl, file, (p) => {
        setProgress(p);
      }, abortRef);

      // 2. Upload Thumbnail if present
      let thumbnailStorageId = undefined;
      if (thumbnailFile) {
        setStatusMessage("Uploading thumbnail image…");
        try {
          const thumbUploadUrl = await http.mutation(api.videos.generateUploadUrl, { token });
          const storedThumb = await uploadToConvex(thumbUploadUrl, thumbnailFile);
          thumbnailStorageId = storedThumb.storageId;
        } catch {
          // If thumbnail upload fails, still proceed with video publication
        }
      }

      // 3. Publish to Convex database
      setPhase("publishing");
      setStatusMessage("Publishing video…");
      const result = await http.mutation(api.videos.publishVideo, {
        token,
        storageId: storedVideo.storageId,
        thumbnailStorageId,
        durationSeconds: videoDuration > 0 ? Math.round(videoDuration) : undefined,
        kind,
        title: title.trim(),
        caption: caption.trim() || undefined,
      });

      setPublished({ videoId: result.videoId, title: title.trim(), kind });
      setPhase("done");
      setFile(null);
      setThumbnailFile(null);
      setTitle("");
      setCaption("");
      toast.push("Video published successfully.", "success");
    } catch (caught) {
      if (caught?.aborted) {
        setPhase("idle");
        toast.push("Upload cancelled.", "info");
        return;
      }
      const message = getErrorMessage(caught);
      setError(message);
      setPhase("idle");
      toast.push(message, "error");
    }
  }

  function reset() {
    setFile(null);
    setThumbnailFile(null);
    setThumbnailPreviewUrl(null);
    setIsCustomThumbnail(false);
    setTitle("");
    setCaption("");
    setPublished(null);
    setProgress(0);
    setError(null);
    setPhase("idle");
    setKind("video");
  }

  if (phase === "done" && published) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Upload"
          description={
            published.kind === "reel"
              ? "Your reel is live on the Reels tab."
              : "Your video is now live on Anarchos."
          }
        />
        <div className="card space-y-5 px-5 py-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-zinc-50">“{published.title}” published!</h2>
            <p className="text-sm text-zinc-400">
              {published.kind === "reel"
                ? "It appears on the Reels tab and on your profile, not in the home feed."
                : "It is now available in the video grid and ready for watching."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() =>
                router.navigate(
                  published.kind === "reel" ? `/reels/${published.videoId}` : `/watch/${published.videoId}`
                )
              }
            >
              <IconPlay className="size-4 translate-x-0.5" />
              {published.kind === "reel" ? "Open in Reels" : "Watch video now"}
            </Button>
            <Button variant="secondary" onClick={() => router.navigate(`/u/${user?.username}`)}>
              Go to your profile
            </Button>
            <Button variant="ghost" onClick={reset}>
              Upload another video
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const busy = phase === "uploading" || phase === "publishing";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload"
        description="Publish a regular video to the home feed, or a reel for the Reels tab."
      />

      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-200">Post type</legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind("video")}
              disabled={busy}
              aria-pressed={kind === "video"}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                kind === "video"
                  ? "border-brand-500 bg-brand-600/15 text-zinc-50"
                  : "border-line-600 bg-surface-900 text-zinc-400 hover:border-line-500 hover:text-zinc-200"
              )}
            >
              <IconPlay className="size-5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">Video</span>
                <span className="block text-xs text-zinc-500">Shows on Home</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setKind("reel")}
              disabled={busy}
              aria-pressed={kind === "reel"}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                kind === "reel"
                  ? "border-brand-500 bg-brand-600/15 text-zinc-50"
                  : "border-line-600 bg-surface-900 text-zinc-400 hover:border-line-500 hover:text-zinc-200"
              )}
            >
              <IconReels className="size-5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">Reel</span>
                <span className="block text-xs text-zinc-500">Shows on Reels only</span>
              </span>
            </button>
          </div>
          {kind === "reel" ? (
            <p className="mt-2 text-xs text-zinc-500">
              Reels work best as short, vertical clips. They do not appear in the home feed.
            </p>
          ) : null}
        </fieldset>

        {/* 1. Video File Picker / Drag & Drop */}
        <div>
          <label htmlFor="upload-file" className="mb-1.5 block text-sm font-medium text-zinc-200">
            Video file
          </label>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              acceptVideoFile(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              "rounded-xl border border-dashed p-5 transition-colors",
              dragging ? "border-brand-500 bg-brand-700/10" : "border-line-600 bg-surface-900"
            )}
          >
            {previewUrl ? (
              <div className="space-y-3">
                <video
                  ref={previewVideoRef}
                  src={previewUrl}
                  controls
                  playsInline
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onSeeked={handleVideoSeeked}
                  className="max-h-[48vh] w-full rounded-lg bg-black object-contain shadow-md"
                  aria-label="Selected video preview"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-200">{file.name}</p>
                    <p className="text-xs text-zinc-500">
                      {formatBytes(file.size)}
                      {videoDuration > 0 ? ` · ${formatDuration(videoDuration)}` : ""}
                      {file.type ? ` · ${file.type}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={handleCaptureCurrentFrame}
                      title="Capture current video frame as thumbnail"
                    >
                      <IconCamera className="size-4" />
                      Capture Frame
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => videoInputRef.current?.click()}
                    >
                      Replace
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-surface-800 text-zinc-300">
                  <IconUpload className="size-6 text-brand-400" />
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    Drag and drop a video, or choose a file
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    MP4, WebM or MOV up to 100 MB
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => videoInputRef.current?.click()}
                >
                  Choose video file
                </Button>
              </div>
            )}
            <input
              id="upload-file"
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(event) => acceptVideoFile(event.target.files?.[0])}
              disabled={busy}
            />
          </div>
        </div>

        {/* 2. Thumbnail Section */}
        {file && (
          <div className="card space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="block text-sm font-semibold text-zinc-200">Video Thumbnail</span>
                <span className="text-xs text-zinc-500">
                  Upload a custom image or use the auto-captured frame from your video.
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* Thumbnail preview box */}
              <div className="relative aspect-video w-full max-w-[200px] overflow-hidden rounded-lg bg-surface-850 ring-1 ring-line-700">
                {thumbnailPreviewUrl ? (
                  <img
                    src={thumbnailPreviewUrl}
                    alt="Thumbnail preview"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-zinc-500">
                    No thumbnail
                  </div>
                )}
                {isCustomThumbnail && (
                  <span className="absolute top-1.5 left-1.5 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase shadow">
                    Custom
                  </span>
                )}
              </div>

              {/* Thumbnail Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => thumbInputRef.current?.click()}
                >
                  <IconCamera className="size-4" />
                  Upload Custom Thumbnail
                </Button>

                {thumbnailFile && isCustomThumbnail && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setIsCustomThumbnail(false);
                      setThumbnailFile(null);
                      // Trigger video re-capture
                      if (previewVideoRef.current) {
                        handleVideoSeeked();
                      }
                    }}
                  >
                    <IconClose className="size-4" />
                    Reset to auto
                  </Button>
                )}
              </div>

              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => acceptThumbnailFile(e.target.files?.[0])}
                disabled={busy}
              />
            </div>
          </div>
        )}

        {/* 3. Title Field */}
        <Field
          label="Title"
          htmlFor="upload-title"
          hint="Required. Shown in the video feed and watch page."
          counter={`${title.length}/${TITLE_MAX}`}
        >
          <Input
            id="upload-title"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a catchy title"
            disabled={busy}
          />
        </Field>

        {/* 4. Caption Field */}
        <Field
          label="Caption / Description"
          htmlFor="upload-caption"
          hint="Optional description, notes, or details for your viewers."
          counter={`${caption.length}/${CAPTION_MAX}`}
        >
          <Textarea
            id="upload-caption"
            value={caption}
            maxLength={CAPTION_MAX}
            rows={4}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Tell viewers what your video is about"
            disabled={busy}
          />
        </Field>

        {error ? (
          <p className="flex items-start gap-2 text-sm text-brand-300" role="alert">
            <IconAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {/* 5. Progress Bar */}
        {busy ? (
          <div className="card space-y-3 px-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300 font-medium">{statusMessage}</span>
              <span className="tabular-nums text-zinc-400 font-semibold">
                {phase === "uploading" ? `${progress}%` : "Processing"}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-700"
              role="progressbar"
              aria-valuenow={phase === "uploading" ? progress : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-full bg-brand-500 transition-[width] duration-150",
                  phase === "publishing" && "w-full animate-pulse"
                )}
                style={{ width: phase === "publishing" ? "100%" : `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* 6. Form Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={handlePublish} disabled={!file || !title.trim()} loading={busy} size="lg">
            Publish Video
          </Button>
          {busy && phase === "uploading" ? (
            <Button
              variant="secondary"
              onClick={() => {
                abortRef.current?.abort();
              }}
            >
              Cancel upload
            </Button>
          ) : null}
          {!busy && (file || title || caption) ? (
            <Button variant="ghost" onClick={reset}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
