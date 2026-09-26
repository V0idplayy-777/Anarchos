import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/session";
import { Input, PageHeader, Skeleton, Tabs } from "../components/ui";
import { UserRow } from "../components/user";
import { VideoGridCard } from "../components/video-grid-card";
import { IconSearch, IconUsers, IconTag } from "../components/icons";
import { ErrorBoundary } from "../components/error-boundary";
import { cn } from "../utils/cn";

export function SearchPage() {
  const { token } = useAuth();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [searchMode, setSearchMode] = useState("videos"); // "users" | "videos"
  const [kindFilter, setKindFilter] = useState("all"); // all | video | reel
  const [uploadDateFilter, setUploadDateFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 220);
    return () => clearTimeout(timer);
  }, [term]);

  const userResult = useQuery(
    api.users.search,
    token && debounced.length > 0 && searchMode === "users" ? { query: debounced, token, limit: 24 } : "skip"
  );

  const videoResult = useQuery(
    api.videos.searchVideos,
    token && debounced.length > 0 && searchMode === "videos"
      ? {
          query: debounced,
          token,
          kind: kindFilter !== "all" ? kindFilter : undefined,
          category: categoryFilter !== "all" ? categoryFilter : undefined,
          uploadDate: uploadDateFilter !== "all" ? uploadDateFilter : undefined,
          limit: 24,
        }
      : "skip"
  );

  const users = userResult?.users ?? [];
  const videos = videoResult?.videos ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Search" description="Find people and videos by title, description, and tags." />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={searchMode}
          onChange={setSearchMode}
          tabs={[
            { value: "videos", label: "Videos" },
            { value: "users", label: "People" },
          ]}
        />
      </div>

      <div className="relative">
        <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-zinc-500" />
        <label htmlFor="user-search" className="sr-only">
          Search
        </label>
        <Input
          id="user-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={searchMode === "videos" ? "Search videos, tags, categories..." : "Search people"}
          autoComplete="off"
          className="h-11 pl-10"
        />
      </div>

      {searchMode === "videos" && debounced.length > 0 && (
        <div className="space-y-3 rounded-xl border border-line-700 bg-surface-900 p-3">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-medium text-zinc-500">Type:</span>
            {["all", "video", "reel"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs capitalize",
                  kindFilter === k ? "bg-zinc-100 text-zinc-900" : "bg-surface-800 text-zinc-400"
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-medium text-zinc-500">Date:</span>
            {["all", "today", "week", "month", "year"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setUploadDateFilter(d)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs capitalize",
                  uploadDateFilter === d ? "bg-zinc-100 text-zinc-900" : "bg-surface-800 text-zinc-400"
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-medium text-zinc-500">Category:</span>
            {["all", "music", "gaming", "vlog", "education", "comedy", "tech"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs capitalize",
                  categoryFilter === c ? "bg-zinc-100 text-zinc-900" : "bg-surface-800 text-zinc-400"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {debounced.length === 0 ? (
        <div className="rounded-xl border border-line-700 bg-surface-900 px-5 py-8 text-center">
          <p className="text-sm font-medium text-zinc-300">
            {searchMode === "videos" ? "Search for videos on Anarchos" : "Search for people on Anarchos"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500">
            {searchMode === "videos"
              ? "Search by title, description, tags, or category. Use filters to narrow by type and upload date."
              : "Enter a username or display name to find profiles. You can follow anyone, and messaging becomes available once you both follow each other."}
          </p>
        </div>
      ) : searchMode === "users" ? (
        userResult === undefined ? (
          <div className="divide-y divide-line-700">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-center gap-3 py-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-line-700 bg-surface-900 px-5 py-8 text-center">
            <p className="text-sm font-medium text-zinc-300">No people found for “{debounced}”</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500">
              Check the spelling or try a shorter part of the name. Usernames are matched from the beginning of the handle.
            </p>
          </div>
        ) : (
          <ErrorBoundary resetKey={debounced}>
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                <IconUsers className="size-4" />
                {users.length} {users.length === 1 ? "person" : "people"}
              </h2>
              <div className="divide-y divide-line-700">
                {users.map((user) => (
                  <UserRow key={user._id} user={user} />
                ))}
              </div>
            </section>
          </ErrorBoundary>
        )
      ) : videoResult === undefined ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-video w-full rounded-xl" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-xl border border-line-700 bg-surface-900 px-5 py-8 text-center">
          <p className="text-sm font-medium text-zinc-300">No videos found for “{debounced}”</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500">
            Try different keywords, check filters, or search for people instead.
          </p>
        </div>
      ) : (
        <ErrorBoundary resetKey={debounced + kindFilter + uploadDateFilter}>
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              <IconTag className="size-4" />
              {videos.length} {videos.length === 1 ? "video" : "videos"}
            </h2>
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((video) => (
                <VideoGridCard key={video._id} video={video} />
              ))}
            </div>
          </section>
        </ErrorBoundary>
      )}
    </div>
  );
}
