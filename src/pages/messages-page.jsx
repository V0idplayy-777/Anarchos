import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getErrorMessage } from "../lib/convex";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { formatClock, formatDateSeparator, formatDay } from "../lib/format";
import { Link, useRouter } from "../lib/router";
import { Avatar, Button, EmptyState, PageHeader, Skeleton, Textarea } from "../components/ui";
import { IconArrowLeft, IconMessage, IconSend } from "../components/icons";
import { cn } from "../utils/cn";

const PAGE_SIZE = 40;

export function MessagesPage({ conversationId }) {
  const { token } = useAuth();
  const list = useQuery(api.messages.listConversations, token ? { token } : "skip");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Direct messages are available between people who follow each other."
      />

      <div className="lg:grid lg:grid-cols-[290px_1fr] lg:gap-6">
        <section
          aria-label="Conversations"
          className={cn("space-y-1", conversationId && "hidden lg:block")}
        >
          {list === undefined ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-center gap-3 rounded-lg p-2">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.conversations.length === 0 ? (
            <EmptyState
              icon={<IconMessage className="size-5" />}
              title="No conversations yet"
              description="Follow someone and wait for them to follow you back. Once you are mutual followers you can start messaging here."
              action={
                <Link to="/search">
                  <Button size="sm" variant="secondary">
                    Find people
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-1">
              {list.conversations.map((conversation) => (
                <li key={conversation._id}>
                  <ConversationListItem
                    conversation={conversation}
                    active={conversation._id === conversationId}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Conversation" className={cn(!conversationId && "hidden lg:block")}>
          {conversationId ? (
            <Thread conversationId={conversationId} />
          ) : (
            <div className="hidden h-full min-h-64 place-items-center rounded-xl border border-line-700 bg-surface-900 px-6 text-center lg:grid">
              <div>
                <p className="text-sm font-medium text-zinc-300">Select a conversation</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Pick a conversation on the left, or start one from someone's profile.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationListItem({ conversation, active }) {
  return (
    <Link
      to={`/messages/${conversation._id}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        active ? "bg-surface-800" : "hover:bg-surface-850"
      )}
    >
      <Avatar user={conversation.other} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-zinc-100">
            {conversation.other.displayName || conversation.other.username}
          </span>
          <span className="shrink-0 text-[11px] text-zinc-500">
            {formatDay(conversation.lastMessageAt)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-sm text-zinc-500">
          {conversation.lastMessageText || "No messages yet"}
        </span>
      </span>
    </Link>
  );
}

function Thread({ conversationId }) {
  const { token } = useAuth();
  const toast = useToast();
  const { navigate } = useRouter();
  const sendMessage = useMutation(api.messages.sendMessage);
  const bottomRef = useRef(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const thread = usePaginatedQuery(
    api.messages.listMessages,
    token ? { token, conversationId } : "skip",
    { initialNumItems: PAGE_SIZE }
  );
  const conversation = useQuery(
    api.messages.getConversation,
    token ? { token, conversationId } : "skip"
  );

  // Pages arrive newest-first; reverse so the thread reads oldest to newest.
  const messages = useMemo(() => [...(thread.results ?? [])].reverse(), [thread.results]);
  const other = conversation?.other;
  const lastId = messages.length ? messages[messages.length - 1]._id : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastId, conversationId]);

  async function handleSend(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage({ token, conversationId, text });
      setDraft("");
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
      toast.push(message, "error");
    } finally {
      setSending(false);
    }
  }

  if (thread.status === "LoadingFirstPage" || conversation === undefined) {
    return (
      <div className="card space-y-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-10 w-1/3" />
      </div>
    );
  }

  const locked = Boolean(conversation && !conversation.isFriend);

  let previousDay = null;

  return (
    <div className="card flex h-[70vh] min-h-96 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line-700 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate("/messages")}
          className="rounded-md p-1 text-zinc-400 transition hover:bg-surface-800 hover:text-zinc-100 lg:hidden"
          aria-label="Back to conversations"
        >
          <IconArrowLeft className="size-5" />
        </button>
        {other ? (
          <Link to={`/u/${other.username}`} className="flex min-w-0 items-center gap-3">
            <Avatar user={other} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-zinc-100">
                {other.displayName || other.username}
              </span>
              <span className="block truncate text-xs text-zinc-500">@{other.username}</span>
            </span>
          </Link>
        ) : (
          <Skeleton className="h-9 w-40" />
        )}
        {conversation ? (
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              conversation.isFriend
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-line-600 bg-surface-800 text-zinc-400"
            )}
          >
            {conversation.isFriend ? "Mutual followers" : "Not connected"}
          </span>
        ) : null}
      </header>

      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {thread.status === "CanLoadMore" ? (
          <div className="flex justify-center pb-3">
            <Button variant="ghost" size="sm" onClick={() => thread.loadMore(PAGE_SIZE)}>
              Load earlier messages
            </Button>
          </div>
        ) : null}

        {messages.length === 0 ? (
          <EmptyState
            icon={<IconMessage className="size-5" />}
            title="No messages yet"
            description="Send the first message to start the conversation."
            className="border-none bg-transparent py-10"
          />
        ) : (
          messages.map((message) => {
            const day = formatDateSeparator(message.createdAt);
            const showDay = day !== previousDay;
            previousDay = day;
            return (
              <div key={message._id}>
                {showDay ? (
                  <p className="py-3 text-center text-[11px] font-medium tracking-wide text-zinc-600 uppercase">
                    {day}
                  </p>
                ) : null}
                <div className={cn("flex py-0.5", message.mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap sm:max-w-[70%]",
                      message.mine
                        ? "rounded-br-md bg-brand-600/90 text-white"
                        : "rounded-bl-md bg-surface-800 text-zinc-100"
                    )}
                  >
                    {message.text}
                    <span
                      className={cn(
                        "mt-1 block text-[10px]",
                        message.mine ? "text-white/70" : "text-zinc-500"
                      )}
                    >
                      {formatClock(message.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="border-t border-line-700 px-4 py-3">
        {locked ? (
          <p className="text-sm text-zinc-400">
            You and {other?.username ?? "this member"} no longer follow each other, so new messages
            are unavailable. Follow each other again to reopen this conversation.
          </p>
        ) : (
          <>
            <label htmlFor="message-composer" className="sr-only">
              Message {other?.username}
            </label>
            <div className="flex items-end gap-2">
              <Textarea
                id="message-composer"
                value={draft}
                rows={1}
                max={2000}
                placeholder={`Message @${other?.username ?? ""}`}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend(event);
                  }
                }}
                className="max-h-32 min-h-10"
              />
              <Button type="submit" loading={sending} disabled={!draft.trim()} aria-label="Send message">
                Send
                <IconSend className="size-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              {error ? (
                <span className="text-brand-300" role="alert">
                  {error}
                </span>
              ) : (
                "Enter to send, Shift + Enter for a new line."
              )}
            </p>
          </>
        )}
      </form>
    </div>
  );
}
