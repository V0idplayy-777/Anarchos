import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getErrorMessage } from "../lib/convex";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { formatCount } from "../lib/format";
import { useRouter } from "../lib/router";
import { Avatar, Button, EmptyState, Skeleton, Tabs } from "../components/ui";
import { FollowButton, UserRow } from "../components/user";
import { VideoGridCard, VideoGridCardSkeleton } from "../components/video-grid-card";
import { ErrorBoundary } from "../components/error-boundary";
import { IconMessage, IconUpload, IconUser } from "../components/icons";

const VIDEO_PAGE = 5;
const PEOPLE_PAGE = 20;

export function ProfilePage({ username }) {
  return (
    <ErrorBoundary key={username} resetKey={username}>
      <ProfileContent username={username} />
    </ErrorBoundary>
  );
}

function ProfileContent({ username }) {
  const { token } = useAuth();
  const [tab, setTab] = useState("videos");

  const profile = useQuery(
    api.users.getByUsername,
    username && token ? { username, token } : "skip"
  );

  if (profile === undefined) {
    return (
      <div className="space-y-6">
        <div className="card flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const user = profile.user;
  const isSelf = profile.relationship.isSelf;

  return (
    <div className="space-y-6">
      <section className="card px-5 py-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar user={user} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
                {user.displayName || user.username}
              </h1>
              {profile.relationship.followsViewer && !isSelf ? (
                <span className="rounded border border-line-600 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
                  Follows you
                </span>
              ) : null}
            </div>
            <p className="text-sm text-zinc-500">@{user.username}</p>
            {user.bio ? (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-300">
                {user.bio}
              </p>
            ) : (
              <p className="mt-3 text-sm text-zinc-600">
                {isSelf ? "Add a short bio in Settings so people know who you are." : "No bio yet."}
              </p>
            )}

            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-zinc-500">Videos</dt>
                <dd className="font-semibold text-zinc-100 tabular-nums">
                  {formatCount(user.videoCount)}
                </dd>
              </div>
              <button
                type="button"
                onClick={() => setTab("followers")}
                className="flex items-baseline gap-1.5 text-left"
              >
                <dt className="text-zinc-500">Followers</dt>
                <dd className="font-semibold text-zinc-100 tabular-nums">
                  {formatCount(user.followerCount)}
                </dd>
              </button>
              <button
                type="button"
                onClick={() => setTab("following")}
                className="flex items-baseline gap-1.5 text-left"
              >
                <dt className="text-zinc-500">Following</dt>
                <dd className="font-semibold text-zinc-100 tabular-nums">
                  {formatCount(user.followingCount)}
                </dd>
              </button>
            </dl>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isSelf ? (
              <EditProfileButton />
            ) : (
              <>
                <FollowButton userId={user._id} following={profile.relationship.isFollowing} />
                <MessageButton
                  userId={user._id}
                  enabled={profile.relationship.isFriend}
                  username={user.username}
                />
              </>
            )}
          </div>
        </div>
      </section>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "videos", label: "Videos" },
          { value: "reels", label: "Reels" },
          { value: "followers", label: "Followers" },
          { value: "following", label: "Following" },
        ]}
      />

      {tab === "videos" ? (
        <VideosTab username={username} isSelf={isSelf} kind="video" />
      ) : tab === "reels" ? (
        <VideosTab username={username} isSelf={isSelf} kind="reel" />
      ) : (
        <PeopleTab
          tab={tab}
          userId={user._id}
          emptyTitle={tab === "followers" ? "No followers yet" : "Not following anyone yet"}
          emptyDescription={
            tab === "followers"
              ? `When people follow @${user.username}, they will appear here.`
              : isSelf
                ? "Find people to follow and their videos will show up in your feed."
                : `@${user.username} is not following anyone yet.`
          }
        />
      )}

    </div>
  );
}

function UploadButton() {
  const router = useRouter();
  return <Button size="sm" onClick={() => router.navigate("/upload")}>Upload a video</Button>;
}

function EditProfileButton() {
  const router = useRouter();
  return (
    <Button variant="secondary" size="sm" onClick={() => router.navigate("/settings")}>
      Edit profile
    </Button>
  );
}

function MessageButton({ userId, enabled, username }) {
  const { token } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const openConversation = useMutation(api.messages.openConversation);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!enabled || busy) return;
    setBusy(true);
    try {
      const result = await openConversation({ token, userId });
      router.navigate(`/messages/${result.conversation._id}`);
    } catch (error) {
      toast.push(getErrorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={enabled ? "secondary" : "ghost"}
      size="sm"
      loading={busy}
      disabled={!enabled}
      onClick={handleClick}
      title={
        enabled
          ? `Message @${username}`
          : "Messaging is available once you both follow each other"
      }
    >
      <IconMessage className="size-4" />
      Message
    </Button>
  );
}

function VideosTab({ username, isSelf, kind = "video" }) {
  const { token } = useAuth();
  const videos = usePaginatedQuery(
    api.videos.listByAuthor,
    token && username ? { username, token, kind } : "skip",
    { initialNumItems: 12 }
  );

  if (videos === undefined || videos.status === "LoadingFirstPage") {
    return (
      <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <VideoGridCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (videos.results.length === 0) {
    return (
      <EmptyState
        icon={isSelf ? <IconUpload className="size-5" /> : <IconUser className="size-5" />}
        title={
          kind === "reel"
            ? isSelf
              ? "You have not posted any reels yet"
              : "No reels yet"
            : isSelf
              ? "You have not uploaded any videos yet"
              : "No videos yet"
        }
        description={
          kind === "reel"
            ? isSelf
              ? "Publish a reel and it will appear here and on the Reels tab."
              : "This member has not posted any reels yet."
            : isSelf
              ? "Publish your first video and it will appear on your profile and in the home feed."
              : "This member has not published any videos yet. Follow them to see new uploads in your feed."
        }
        action={isSelf ? <UploadButton /> : null}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {videos.results.map((video) => (
          <ErrorBoundary key={video._id} resetKey={video._id}>
            <VideoGridCard video={video} />
          </ErrorBoundary>
        ))}
      </div>
      {videos.status === "CanLoadMore" ? (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" size="sm" onClick={() => videos.loadMore(12)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PeopleTab({ tab, userId, emptyTitle, emptyDescription }) {
  const { token } = useAuth();
  const query = tab === "followers" ? api.users.listFollowers : api.users.listFollowing;
  const result = usePaginatedQuery(
    query,
    token && userId ? { userId, token } : "skip",
    { initialNumItems: PEOPLE_PAGE }
  );
  const people = result?.results ?? [];

  if (result === undefined || result.status === "LoadingFirstPage") {
    return (
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
    );
  }

  if (people.length === 0) {
    return (
      <EmptyState icon={<IconUser className="size-5" />} title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className="card divide-y divide-line-700 px-4">
      {people.map((person) => (
        <UserRow key={person._id} user={person} />
      ))}
      {result.status === "CanLoadMore" ? (
        <div className="flex justify-center py-3">
          <Button variant="ghost" size="sm" onClick={() => result.loadMore(PEOPLE_PAGE)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
