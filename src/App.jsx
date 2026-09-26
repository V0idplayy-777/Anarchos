import { AuthProvider, useAuth } from "./lib/session";
import { ToastProvider } from "./lib/toast";
import { ThemeProvider } from "./lib/theme";
import { RouterProvider, useSegments } from "./lib/router";
import { convex } from "./lib/convex";
import { ConvexProvider } from "convex/react";
import { AppShell } from "./components/app-shell";
import { ErrorBoundary } from "./components/error-boundary";
import { Spinner, Button } from "./components/ui";
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
import { Link } from "./lib/router";

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

function GuestRoutes() {
  const [first, second] = useSegments();
  switch (first) {
    case "watch":
    case "v":
      return <WatchPage videoId={second} />;
    case "u":
      return second ? <ProfilePage username={second} guest /> : <NotFound />;
    case "terms":
      return <TermsPage standalone />;
    default:
      return null;
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

function GuestShell({ children }) {
  return (
    <div className="min-h-dvh bg-surface-950">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line-700 bg-surface-900/95 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-brand-600 text-[15px] font-bold text-white">
            A
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-zinc-50">Anarchos</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link to="/signup">
            <Button size="sm">Sign up</Button>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        {children}
        <div className="mt-8 rounded-xl border border-line-700 bg-surface-900 px-5 py-4 text-center">
          <p className="text-sm font-medium text-zinc-200">Join Anarchos to like, comment, and follow</p>
          <p className="mt-1 text-xs text-zinc-500">Create an account to interact with videos and message creators.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link to="/signup"><Button size="sm">Create account</Button></Link>
            <Link to="/login"><Button variant="secondary" size="sm">Log in</Button></Link>
          </div>
        </div>
      </main>
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
    // Allow guest viewing for public videos and profiles and terms
    const guestAllowed = ["watch", "v", "u", "terms"];
    if (guestAllowed.includes(first)) {
      // Special case: watch/v should be fully public
      if (first === "watch" || first === "v") {
        return (
          <GuestShell>
            <ErrorBoundary resetKey={`${first ?? ""}/${second ?? ""}`}>
              <WatchPage videoId={second} />
            </ErrorBoundary>
          </GuestShell>
        );
      }
      if (first === "terms") {
        return (
          <div className="mx-auto w-full max-w-3xl px-4 py-8">
            <TermsPage standalone />
          </div>
        );
      }
      // For /u/:username guest preview
      if (first === "u" && second) {
        return (
          <GuestShell>
            <ErrorBoundary resetKey={`${first}/${second}`}>
              <ProfilePage username={second} guest />
            </ErrorBoundary>
          </GuestShell>
        );
      }
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
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider>
              <SessionNotice />
              <AuthenticatedApp />
            </RouterProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ConvexProvider>
  );
}
