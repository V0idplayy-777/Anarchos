import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/session";
import { Input, PageHeader, Skeleton } from "../components/ui";
import { UserRow } from "../components/user";
import { IconSearch, IconUsers } from "../components/icons";
import { ErrorBoundary } from "../components/error-boundary";

export function SearchPage() {
  const { token } = useAuth();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 220);
    return () => clearTimeout(timer);
  }, [term]);

  const result = useQuery(
    api.users.search,
    token && debounced.length > 0 ? { query: debounced, token, limit: 24 } : "skip"
  );

  const users = result?.users ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Search" description="Find people by username or display name." />

      <div className="relative">
        <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-zinc-500" />
        <label htmlFor="user-search" className="sr-only">
          Search for people
        </label>
        <Input
          id="user-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search people"
          autoComplete="off"
          className="h-11 pl-10"
        />
      </div>

      {debounced.length === 0 ? (
        <div className="rounded-xl border border-line-700 bg-surface-900 px-5 py-8 text-center">
          <p className="text-sm font-medium text-zinc-300">Search for people on Anarchos</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500">
            Enter a username or display name to find profiles. You can follow anyone, and messaging
            becomes available once you both follow each other.
          </p>
        </div>
      ) : result === undefined ? (
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
          <p className="text-sm font-medium text-zinc-300">
            No people found for “{debounced}”
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500">
            Check the spelling or try a shorter part of the name. Usernames are matched from the
            beginning of the handle.
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
      )}
    </div>
  );
}
