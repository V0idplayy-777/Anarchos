import { Link, useRouter } from "../lib/router";
import { formatCount, formatDuration, timeAgo } from "../lib/format";
import { Avatar } from "./ui";
import { IconPlay, IconEye, IconTag } from "./icons";
import { cn } from "../utils/cn";

export function VideoGridCard({ video, className }) {
  const router = useRouter();

  const handleCardClick = (e) => {
    if (e.target.closest("a") || e.target.closest("button")) {
      return;
    }
    router.navigate(video.kind === "reel" ? `/reels/${video._id}` : `/watch/${video._id}`);
  };

  const hasThumbnail = Boolean(video.thumbnailUrl);
  const durationText = formatDuration(video.durationSeconds);

  return (
    <article onClick={handleCardClick} className={cn("group flex flex-col cursor-pointer transition-all duration-200", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-900 ring-1 ring-line-700/60 transition-all duration-200 group-hover:ring-line-600 group-hover:shadow-lg">
        {hasThumbnail ? (
          <img src={video.thumbnailUrl} alt={video.title} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="relative size-full flex flex-col items-center justify-center bg-gradient-to-br from-surface-850 via-surface-900 to-surface-950 p-4 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-surface-800/80 text-brand-400 shadow-md ring-1 ring-line-700">
              <IconPlay className="size-6 translate-x-0.5" />
            </div>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="grid size-11 place-items-center rounded-full bg-brand-600/90 text-white shadow-xl backdrop-blur-sm transition-transform duration-200 group-hover:scale-105">
            <IconPlay className="size-5 translate-x-0.5" />
          </span>
        </div>

        {durationText ? (
          <span className="absolute right-2 bottom-2 rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white shadow-sm backdrop-blur-[2px]">{durationText}</span>
        ) : null}

        {video.viewCount > 0 && (
          <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
            <IconEye className="size-3" /> {formatCount(video.viewCount)}
          </span>
        )}

        {video.category && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium capitalize text-white">{video.category}</span>
        )}
      </div>

      <div className="mt-3 flex items-start gap-3 px-0.5">
        <Link to={`/u/${video.author.username}`} onClick={(e) => e.stopPropagation()} className="shrink-0 transition-opacity hover:opacity-85" aria-label={`View ${video.author.username}'s profile`}>
          <Avatar user={video.author} size="sm" />
        </Link>

        <div className="min-w-0 flex-1">
          <Link to={video.kind === "reel" ? `/reels/${video._id}` : `/watch/${video._id}`} className="block text-[14.5px] font-semibold leading-snug text-zinc-100 transition-colors line-clamp-2 group-hover:text-brand-300">
            {video.title}
          </Link>

          <Link to={`/u/${video.author.username}`} onClick={(e) => e.stopPropagation()} className="mt-1 block truncate text-xs text-zinc-400 transition-colors hover:text-zinc-200">
            {video.author.displayName || video.author.username}
          </Link>

          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
            <span>{formatCount(video.likeCount)} likes</span>
            <span>•</span>
            <span>{formatCount(video.commentCount)} comments</span>
            <span>•</span>
            <span>{timeAgo(video.createdAt)}</span>
          </div>

          {video.tags && video.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {video.tags.slice(0, 3).map((t) => (
                <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-surface-800 px-2 py-0.5 text-[10px] text-zinc-400">
                  <IconTag className="size-3" /> {t}
                </span>
              ))}
              {video.tags.length > 3 && <span className="text-[10px] text-zinc-500">+{video.tags.length - 3}</span>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function VideoGridCardSkeleton() {
  return (
    <div className="flex flex-col animate-pulse">
      <div className="aspect-video w-full rounded-xl bg-surface-850" />
      <div className="mt-3 flex items-start gap-3">
        <div className="size-9 shrink-0 rounded-full bg-surface-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-5/6 rounded bg-surface-800" />
          <div className="h-3 w-1/2 rounded bg-surface-800" />
          <div className="h-3 w-2/3 rounded bg-surface-800" />
        </div>
      </div>
    </div>
  );
}
