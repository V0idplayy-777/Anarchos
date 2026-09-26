import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getErrorMessage } from "../lib/convex";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { timeAgo } from "../lib/format";
import { Link } from "../lib/router";
import { Avatar, Button, EmptyState, Skeleton, Textarea } from "./ui";
import { IconComment, IconTrash } from "./icons";

export function Comments({ videoId, open, canModerate, onCountChange, className }) {
  const { token, user: viewer } = useAuth();
  const toast = useToast();
  const addComment = useMutation(api.videos.addComment);
  const deleteComment = useMutation(api.videos.deleteComment);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const result = useQuery(
    api.videos.listComments,
    open ? { videoId, limit: 30 } : "skip"
  );

  async function handleSubmit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      setError("Write a comment first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await addComment({ token, videoId, text });
      setDraft("");
      toast.push("Comment posted.", "success");
      onCountChange?.(created.commentCount);
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
      toast.push(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId) {
    setDeletingId(commentId);
    try {
      const result = await deleteComment({ token, commentId });
      onCountChange?.(result.commentCount);
      toast.push("Comment deleted.", "success");
    } catch (caught) {
      toast.push(getErrorMessage(caught), "error");
    } finally {
      setDeletingId(null);
    }
  }

  if (!open) return null;

  return (
    <div className={className ?? "border-t border-line-700 bg-surface-950/60 px-4 py-4 sm:px-5"}>
      <h3 className="mb-3 text-sm font-semibold text-zinc-200">Comments</h3>

      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        <label htmlFor={`comment-${videoId}`} className="sr-only">
          Add a comment
        </label>
        <Textarea
          id={`comment-${videoId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a comment"
          max={500}
          rows={2}
          className="min-h-16"
          invalid={Boolean(error)}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">{error ?? `${draft.length}/500`}</span>
          <Button type="submit" size="sm" loading={submitting} disabled={!draft.trim()}>
            Comment
          </Button>
        </div>
      </form>

      {result === undefined ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : result.page.length === 0 ? (
        <EmptyState
          icon={<IconComment className="size-5" />}
          title="No comments yet"
          description="Be the first to share what you think about this video."
          className="py-8"
        />
      ) : (
        <ul className="space-y-4">
          {result.page.map((comment) => {
            const canDelete = comment.authorId === viewer?._id || canModerate;
            return (
              <li key={comment._id} className="flex gap-3">
                <Link to={`/u/${comment.author.username}`} aria-label={`View ${comment.author.username}'s profile`}>
                  <Avatar user={comment.author} size="sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <Link
                      to={`/u/${comment.author.username}`}
                      className="truncate text-sm font-medium text-zinc-100 hover:text-white"
                    >
                      {comment.author.displayName || comment.author.username}
                    </Link>
                    <span className="shrink-0 text-xs text-zinc-600">
                      @{comment.author.username} · {timeAgo(comment.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-zinc-300">
                    {comment.text}
                  </p>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment._id)}
                    disabled={deletingId === comment._id}
                    className="shrink-0 rounded-md p-1.5 text-zinc-500 transition hover:bg-surface-800 hover:text-red-300 disabled:opacity-50"
                    aria-label="Delete comment"
                  >
                    <IconTrash className="size-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
