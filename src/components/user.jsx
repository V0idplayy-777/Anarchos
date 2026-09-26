import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { getErrorMessage } from "../lib/convex";
import { Link } from "../lib/router";
import { Avatar, Button } from "./ui";
import { cn } from "../utils/cn";

export function FollowButton({
  userId,
  following = false,
  size = "sm",
  className,
  onChange,
  block = false,
}) {
  const { token } = useAuth();
  const toast = useToast();
  const toggleFollow = useMutation(api.follows.toggleFollow);
  const [state, setState] = useState({ following, busy: false });
  const [lastError, setLastError] = useState(null);

  // Keep local state in sync when the parent refetches a fresh value.
  const [seed, setSeed] = useState(following);
  if (seed !== following) {
    setSeed(following);
    setState({ following, busy: false });
  }

  async function handleToggle() {
    if (!token || state.busy) return;
    const next = !state.following;
    setState({ following: next, busy: true });
    setLastError(null);
    try {
      const result = await toggleFollow({ token, userId });
      setState({ following: result.following, busy: false });
      onChange?.(result.following);
    } catch (error) {
      setState({ following: !next, busy: false });
      setLastError(getErrorMessage(error));
      toast.push(getErrorMessage(error), "error");
    }
  }

  return (
    <span className={cn("inline-flex flex-col items-end gap-1", block && "w-full")}>
      <Button
        size={size}
        variant={state.following ? "secondary" : "primary"}
        loading={state.busy}
        onClick={handleToggle}
        className={block ? "w-full" : className}
        aria-pressed={state.following}
      >
        {state.following ? "Following" : "Follow"}
      </Button>
      {lastError ? (
        <span className="max-w-48 text-right text-xs text-brand-300" role="alert">
          {lastError}
        </span>
      ) : null}
    </span>
  );
}

export function UserRow({ user, right, showBio = true, className }) {
  const { user: viewer } = useAuth();
  const isSelf = viewer?._id === user._id;
  return (
    <div className={cn("flex items-center gap-3 py-3", className)}>
      <Link to={`/u/${user.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar user={user} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">
              {user.displayName || user.username}
            </span>
            {isSelf ? (
              <span className="shrink-0 rounded border border-line-600 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
                You
              </span>
            ) : null}
          </span>
          <span className="block truncate text-sm text-zinc-500">@{user.username}</span>
          {showBio && user.bio ? (
            <span className="mt-0.5 block truncate text-xs text-zinc-600">{user.bio}</span>
          ) : null}
        </span>
      </Link>
      {right ?? (isSelf ? null : <FollowButton userId={user._id} following={user.isFollowing} />)}
    </div>
  );
}
