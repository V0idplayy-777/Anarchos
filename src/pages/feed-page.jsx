import { useEffect, useRef } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/session";
import { Button, EmptyState, PageHeader } from "../components/ui";
import { VideoGridCard, VideoGridCardSkeleton } from "../components/video-grid-card";
import { ErrorBoundary } from "../components/error-boundary";
import { IconUpload } from "../components/icons";
import { Link } from "../lib/router";

const PAGE_SIZE = 12;

export function FeedPage() {
  const { token } = useAuth();
  const sentinel = useRef(null);

  const result = usePaginatedQuery(api.videos.listFeed, token ? { token } : "skip", {
    initialNumItems: PAGE_SIZE,
  });

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
        title="Discover Videos"
        description="Watch and discover the latest uploads on Anarchos."
      />

      {result.results.length === 0 ? (
        <EmptyState
          icon={<IconUpload className="size-5" />}
          title="No videos yet"
          description="The feed is empty because nobody has published a video. Upload the first one and it will appear here for everyone."
          action={
            <Link to="/upload">
              <Button size="sm">Upload a video</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Responsive Rows & Grid of Videos */}
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
    </div>
  );
}
