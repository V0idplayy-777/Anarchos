import { useEffect, useRef, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/session";
import { Button, EmptyState, PageHeader, Tabs } from "../components/ui";
import { VideoGridCard, VideoGridCardSkeleton } from "../components/video-grid-card";
import { ErrorBoundary } from "../components/error-boundary";
import { IconUpload, IconFire, IconTag, IconClock } from "../components/icons";
import { Link } from "../lib/router";
import { UserRow } from "../components/user";
import { cn } from "../utils/cn";

const PAGE_SIZE = 12;
const CATEGORIES = ["all", "music", "gaming", "vlog", "education", "comedy", "tech", "sports", "news"];

export function FeedPage() {
  const { token } = useAuth();
  const sentinel = useRef(null);
  const [feedMode, setFeedMode] = useState("discover"); // "discover" | "following"
  const [sortMode, setSortMode] = useState("chronological"); // "chronological" | "trending"
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  // Queries
  const discoverResult = usePaginatedQuery(
    api.videos.listFeed,
    token && feedMode === "discover"
      ? {
          token,
          sort: sortMode,
          category: categoryFilter !== "all" ? categoryFilter : undefined,
          tag: tagFilter !== "all" ? tagFilter : undefined,
        }
      : "skip",
    { initialNumItems: PAGE_SIZE }
  );

  const followingResult = usePaginatedQuery(
    api.videos.listFollowingFeed,
    token && feedMode === "following" ? { token, kind: "video" } : "skip",
    { initialNumItems: PAGE_SIZE }
  );

  const suggested = useQuery(api.users.suggestedCreators, token ? { token, limit: 6 } : "skip");

  const result = feedMode === "following" ? followingResult : discoverResult;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || result?.status !== "CanLoadMore") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) result.loadMore(PAGE_SIZE);
      },
      { rootMargin: "700px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [result]);

  if (result === undefined) return null;

  if (result.status === "LoadingFirstPage") {
    return (
      <div className="space-y-6">
        <PageHeader title="Discover Videos" description="Watch and discover the latest uploads on Anarchos." />
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <VideoGridCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={feedMode === "following" ? "Following Feed" : "Discover Videos"}
        description={
          feedMode === "following"
            ? "Chronological feed of creators you follow."
            : "Watch and discover the latest uploads on Anarchos."
        }
      />

      {/* Feed mode toggle: Discovery vs Following */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={feedMode}
          onChange={setFeedMode}
          tabs={[
            { value: "discover", label: "Discover" },
            { value: "following", label: "Following" },
          ]}
        />
        {feedMode === "discover" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSortMode("chronological")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                sortMode === "chronological"
                  ? "border-brand-500 bg-brand-600/20 text-zinc-100"
                  : "border-line-600 bg-surface-900 text-zinc-400 hover:text-zinc-200"
              )}
            >
              <IconClock className="size-3.5" /> Latest
            </button>
            <button
              type="button"
              onClick={() => setSortMode("trending")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                sortMode === "trending"
                  ? "border-brand-500 bg-brand-600/20 text-zinc-100"
                  : "border-line-600 bg-surface-900 text-zinc-400 hover:text-zinc-200"
              )}
            >
              <IconFire className="size-3.5" /> Trending
            </button>
          </div>
        )}
      </div>

      {/* Category / Tag filters - only for discover */}
      {feedMode === "discover" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize transition",
                  categoryFilter === cat
                    ? "bg-zinc-100 text-zinc-900 dark:bg-white dark:text-black"
                    : "bg-surface-800 text-zinc-400 hover:bg-surface-700 hover:text-zinc-200"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", "music", "gaming", "vlog", "education", "comedy", "tutorial", "funny"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTagFilter(t)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                  tagFilter === t
                    ? "bg-brand-600 text-white"
                    : "bg-surface-850 text-zinc-500 hover:text-zinc-300"
                )}
              >
                <IconTag className="size-3" />
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {result.results.length === 0 ? (
        <EmptyState
          icon={<IconUpload className="size-5" />}
          title={feedMode === "following" ? "No videos from people you follow" : "No videos yet"}
          description={
            feedMode === "following"
              ? "Follow some creators and their latest videos will appear here in chronological order."
              : "The feed is empty because nobody has published a video. Upload the first one and it will appear here for everyone."
          }
          action={
            <Link to={feedMode === "following" ? "/search" : "/upload"}>
              <Button size="sm">{feedMode === "following" ? "Find people to follow" : "Upload a video"}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {result.results.map((video) => (
              <ErrorBoundary key={video._id} resetKey={video._id}>
                <VideoGridCard video={video} />
              </ErrorBoundary>
            ))}
          </div>

          <div ref={sentinel} aria-hidden="true" className="h-px" />

          <div className="flex justify-center py-4">
            {result.status === "LoadingMore" ? (
              <p className="flex items-center gap-2 text-sm text-zinc-500">
                <span className="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
                Loading more videos…
              </p>
            ) : result.status === "CanLoadMore" ? (
              <Button variant="secondary" size="sm" onClick={() => result.loadMore(PAGE_SIZE)}>
                Load more
              </Button>
            ) : (
              <p className="text-xs text-zinc-600">You have reached the end of the videos.</p>
            )}
          </div>
        </>
      )}

      {/* Suggested creators */}
      {suggested && suggested.users.length > 0 && feedMode === "discover" && (
        <section className="card px-4 py-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">People you might like</h2>
          <p className="mb-3 text-xs text-zinc-500">Based on mutual follows and engagement patterns</p>
          <div className="divide-y divide-line-700">
            {suggested.users.map((u) => (
              <div key={u._id} className="py-2">
                <UserRow user={u} showBio={false} />
                <p className="ml-12 -mt-1 text-[11px] text-zinc-500">{u.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
