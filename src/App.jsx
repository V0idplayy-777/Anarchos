import { AuthProvider, useAuth } from "./lib/session";
import { ToastProvider } from "./toast";
import { RouterProvider, useSegments } from "./lib/router";
import { convex } from "./lib/convex";
import { ConvexProvider } from "convex/react";
import { AppShell } from "./components/app-shell";
import { ErrorBoundary } from "./components/error-boundary";
import { Spinner } from "./components/ui";
import { AuthPage } from "./pages/auth-page";
import { FeedPage } from "./pages/feed-page";
import { SearchPage } from "./pages/search-page";
import { UploadPage } from "./pages/upload-page";
import { MessagesPage } from "./pages/messages-page";
import { ProfilePage } from "./pages/profile-page";
import { SettingsPage } from "./pages/settings-page";
import { TermsPage } from "./pages/terms-page";
import { WatchPage } from "./pages/watch-page";
import { ReelsPage } from "./pages/reels-page";

function Routes() {
  const { user } = useAuth();
  const [first, second] = useSegments();

  switch (first) {
    case undefined:
      return <FeedPage />;
    case "search":
      return <SearchPage />;
    case "upload":
      return <UploadPage />;
    case "messages":
      return <MessagesPage conversationId={second} />;
    case "profile":
      // Convenience alias for the signed-in user's own profile.
      return <ProfilePage username={user?.username} />;
    case "u":
      return second ? <ProfilePage username={second} /> : <ProfilePage username={user?.username} />;
    case "reels":
      return <ReelsPage startId={second} />;
    case "watch":
    case "v":
      return <WatchPage videoId={second} />;
    case "settings":
      return <SettingsPage />;
    case "terms":
      return <TermsPage />;
    default:
      return <NotFound />;
  }
}

function NotFound() {
  return (
    <div className="rounded-xl border border-line-700 bg-surface-900 px-6 py-10 text-center">
      <h1 className="text-lg font-semibold text-zinc-100">Page not found</h1>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500">
        That address does not match anything on Anarchos. Use the navigation to get back to your
        feed.
      </p>
    </div>
  );
}

function AuthenticatedApp() {
  const { status, token } = useAuth();
  const [first, second] = useSegments();

  if (status === "restoring") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-3 text-sm text-zinc-500">
          <Spinner className="size-5 text-brand-400" label="Checking your session" />
          Checking your session…
        </div>
      </div>
    );
  }

  if (status !== "signedIn" || !token) {
    // Terms of Service stay readable without an account.
    if (first === "terms") {
      return (
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <TermsPage standalone />
        </div>
      );
    }
    return (
      <ErrorBoundary resetKey={first === "signup" ? "signup" : "login"}>
        <AuthPage initialMode={first === "signup" ? "signup" : "login"} />
      </ErrorBoundary>
    );
  }

  return (
    <AppShell>
      <ErrorBoundary resetKey={`${first ?? ""}/${second ?? ""}`}>
        <Routes />
      </ErrorBoundary>
    </AppShell>
  );
}

function SessionNotice() {
  const { restoreError } = useAuth();
  if (!restoreError) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-3 z-50 mx-auto w-fit max-w-[92vw] rounded-lg border border-line-600 bg-surface-800 px-4 py-2 text-sm text-zinc-200 shadow-lg"
    >
      {restoreError}
    </div>
  );
}

export default function App() {
  return (
    <ConvexProvider client={convex}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider>
            <SessionNotice />
            <AuthenticatedApp />
          </RouterProvider>
        </AuthProvider>
      </ToastProvider>
    </ConvexProvider>
  );
}
