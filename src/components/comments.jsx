import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getErrorMessage } from "../lib/convex";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { timeAgo, formatCount } from "../lib/format";
import { Link } from "../lib/router";
import { Avatar, Button, EmptyState, Skeleton, Textarea } from "./ui";
import { IconComment, IconTrash, IconHeart, IconPin, IconReply } from "./icons";

export function Comments({ videoId, open, canModerate, onCountChange, className }) {
  const { token, user: viewer } = useAuth();
  const toast = useToast();
  const addComment = useMutation(api.videos.addComment);
  const deleteComment = useMutation(api.videos.deleteComment);
  const toggleLike = useMutation(api.videos.toggleCommentLike);
  const pinComment = useMutation(api.videos.pinComment);

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null); // comment object
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [expandedReplies, setExpandedReplies] = useState({});

  const result = useQuery(
    api.videos.listComments,
    open ? { videoId, limit: 30, token: token || undefined } : "skip"
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
      const created = await addComment({
        token,
        videoId,
        text,
        parentCommentId: replyTo?._id || undefined,
      });
      setDraft("");
      setReplyTo(null);
      toast.push(replyTo ? "Reply posted." : "Comment posted.", "success");
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
      const res = await deleteComment({ token, commentId });
      onCountChange?.(res.commentCount);
      toast.push("Comment deleted.", "success");
    } catch (caught) {
      toast.push(getErrorMessage(caught), "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleLike(comment) {
    if (!token) {
      toast.push("Sign in to like comments.", "info");
      return;
    }
    try {
      await toggleLike({ token, commentId: comment._id });
    } catch (e) {
      toast.push(getErrorMessage(e), "error");
    }
  }

  async function handlePin(comment) {
    try {
      await pinComment({ token, commentId: comment._id, pinned: !comment.pinned });
      toast.push(comment.pinned ? "Unpinned comment." : "Pinned comment.", "success");
    } catch (e) {
      toast.push(getErrorMessage(e), "error");
    }
  }

  if (!open) return null;

  return (
    <div className={className ?? "border-t border-line-700 bg-surface-950/60 px-4 py-4 sm:px-5"}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <IconComment className="size-4" /> Comments
        {result && <span className="text-xs font-normal text-zinc-500">({result.page.length})</span>}
      </h3>

      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        {replyTo && (
          <div className="flex items-center justify-between rounded-lg bg-surface-800 px-3 py-2 text-xs">
            <span className="text-zinc-400">
              Replying to <span className="font-medium text-zinc-200">@{replyTo.author.username}</span>: {replyTo.text.slice(0, 60)}
            </span>
            <button type="button" onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-zinc-200">
              Cancel
            </button>
          </div>
        )}
        <label htmlFor={`comment-${videoId}`} className="sr-only">
          Add a comment
        </label>
        <Textarea
          id={`comment-${videoId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={replyTo ? `Reply to @${replyTo.author.username}...` : "Add a comment"}
          max={500}
          rows={2}
          className="min-h-16"
          invalid={Boolean(error)}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">{error ?? `${draft.length}/500`}</span>
          <Button type="submit" size="sm" loading={submitting} disabled={!draft.trim()}>
            {replyTo ? "Reply" : "Comment"}
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
            const isPinned = comment.pinned;
            return (
              <li key={comment._id} className={`flex gap-3 ${isPinned ? "rounded-lg bg-brand-600/10 px-2 py-2 -mx-2 ring-1 ring-brand-500/20" : ""}`}>
                <Link to={`/u/${comment.author.username}`} aria-label={`View ${comment.author.username}'s profile`}>
                  <Avatar user={comment.author} size="sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Link to={`/u/${comment.author.username}`} className="truncate text-sm font-medium text-zinc-100 hover:text-white">
                      {comment.author.displayName || comment.author.username}
                    </Link>
                    <span className="shrink-0 text-xs text-zinc-600">
                      @{comment.author.username} · {timeAgo(comment.createdAt)}
                    </span>
                    {isPinned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        <IconPin className="size-3" /> Pinned
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-zinc-300">{comment.text}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleLike(comment)}
                      className={`inline-flex items-center gap-1 text-xs ${comment.likedByViewer ? "text-brand-400" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                      <IconHeart filled={comment.likedByViewer} className="size-3.5" />
                      {formatCount(comment.likeCount)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyTo(comment)}
                      className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      <IconReply className="size-3.5" /> Reply
                    </button>
                    {comment.replyCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedReplies((s) => ({ ...s, [comment._id]: !s[comment._id] }))}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        {expandedReplies[comment._id] ? "Hide" : "View"} {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
                      </button>
                    )}
                    {canModerate && !comment.parentCommentId && (
                      <button
                        type="button"
                        onClick={() => handlePin(comment)}
                        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-brand-300"
                      >
                        <IconPin className="size-3.5" /> {isPinned ? "Unpin" : "Pin"}
                      </button>
                    )}
                  </div>
                  {expandedReplies[comment._id] && (
                    <RepliesList parentId={comment._id} token={token} onReply={setReplyTo} />
                  )}
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

function RepliesList({ parentId, token, onReply }) {
  const { user: viewer } = useAuth();
  const toast = useToast();
  const toggleLike = useMutation(api.videos.toggleCommentLike);
  const data = useQuery(api.videos.listCommentReplies, { parentCommentId: parentId, token: token || undefined });

  if (data === undefined) {
    return (
      <div className="mt-2 space-y-2">
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <ul className="mt-3 space-y-3 border-l-2 border-line-700 pl-3">
      {data.replies.map((reply) => (
        <li key={reply._id} className="flex gap-2">
          <Avatar user={reply.author} size="xs" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-medium text-zinc-200">{reply.author.displayName || reply.author.username}</span>
              <span className="text-[11px] text-zinc-500">{timeAgo(reply.createdAt)}</span>
            </div>
            <p className="text-xs leading-relaxed text-zinc-300">{reply.text}</p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!token) return toast.push("Sign in to like", "info");
                  try {
                    await toggleLike({ token, commentId: reply._id });
                  } catch (e) {
                    toast.push(getErrorMessage(e), "error");
                  }
                }}
                className={`inline-flex items-center gap-1 text-[11px] ${reply.likedByViewer ? "text-brand-400" : "text-zinc-500"}`}
              >
                <IconHeart filled={reply.likedByViewer} className="size-3" /> {formatCount(reply.likeCount)}
              </button>
              <button type="button" onClick={() => onReply(reply)} className="text-[11px] text-zinc-500 hover:text-zinc-300">
                Reply
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
