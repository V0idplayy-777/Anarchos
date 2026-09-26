import { Link, useSegments, useRouter } from "../lib/router";
import { useAuth } from "../lib/session";
import { useTheme } from "../lib/theme";
import { Avatar } from "./ui";
import {
  IconHome,
  IconLogout,
  IconMessage,
  IconReels,
  IconSearch,
  IconSettings,
  IconUpload,
  IconUser,
} from "./icons";
import { cn } from "../utils/cn";

function BrandMark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-md bg-brand-600 text-[15px] font-bold text-white"
      >
        A
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-zinc-50">Anarchos</span>
    </span>
  );
}

const NAV_ITEMS = [
  { to: "/", label: "Home", Icon: IconHome, match: (section) => section === "" },
  { to: "/reels", label: "Reels", Icon: IconReels, match: (s) => s === "reels" },
  { to: "/search", label: "Search", Icon: IconSearch, match: (s) => s === "search" },
  { to: "/upload", label: "Upload", Icon: IconUpload, match: (s) => s === "upload" },
  { to: "/messages", label: "Messages", Icon: IconMessage, match: (s) => s === "messages" },
  { to: "/profile", label: "Profile", Icon: IconUser, match: (s) => s === "profile" || s === "u" },
];

function NavLink({ item, onNavigate, layout }) {
  const segment = useSegments()[0] ?? "";
  const active = item.match(segment);
  const Icon = item.Icon;
  if (layout === "sidebar") {
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-surface-800 text-zinc-50"
            : "text-zinc-400 hover:bg-surface-850 hover:text-zinc-200"
        )}
      >
        <Icon className={cn("size-5", active && "text-brand-400")} />
        {item.label}
      </Link>
    );
  }
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
        active ? "text-brand-400" : "text-zinc-500"
      )}
    >
      <Icon className="size-5.5" />
      {item.label}
    </Link>
  );
}

function ThemeToggle({ className }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-surface-850 hover:text-zinc-200",
        className
      )}
    >
      <span className="text-base">{theme === "dark" ? "☀️" : "🌙"}</span>
      <span className="hidden lg:inline">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

export function AppShell({ children }) {
  const { user, signOut } = useAuth();
  const { navigate } = useRouter();
  const segment = useSegments()[0] ?? "";
  const isReels = segment === "reels";

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-dvh bg-surface-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed top-0 left-0 hidden h-dvh w-60 flex-col border-r border-line-700 bg-surface-900 px-3 py-5 lg:flex">
        <Link to="/" className="px-2 pb-6" aria-label="Anarchos home">
          <BrandMark />
        </Link>
        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} item={item} layout="sidebar" />
          ))}
        </nav>
        <div className="mt-4 space-y-1 border-t border-line-700 pt-3">
          <ThemeToggle />
          <Link
            to="/settings"
            aria-current={segment === "settings" ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              segment === "settings"
                ? "bg-surface-800 text-zinc-50"
                : "text-zinc-400 hover:bg-surface-850 hover:text-zinc-200"
            )}
          >
            <IconSettings className={cn("size-5", segment === "settings" && "text-brand-400")} />
            Settings
          </Link>
          <Link
            to={`/u/${user?.username}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-surface-850 hover:text-zinc-200"
          >
            <Avatar user={user} size="xs" alt="" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-zinc-200">
                {user?.displayName || user?.username}
              </span>
              <span className="block truncate text-xs text-zinc-500">@{user?.username}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-surface-850 hover:text-zinc-200"
          >
            <IconLogout className="size-5" />
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar — hidden on Reels so the clip can use the full screen. */}
      <header
        className={cn(
          "sticky top-0 z-30 flex items-center justify-between border-b border-line-700 bg-surface-950/95 px-4 py-3 backdrop-blur lg:hidden",
          isReels && "hidden"
        )}
      >
        <Link to="/" aria-label="Anarchos home">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle className="px-2 py-2" />
          <Link
            to="/settings"
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-surface-800 hover:text-zinc-100"
            aria-label="Settings"
          >
            <IconSettings className="size-5" />
          </Link>
          <Link
            to={`/u/${user?.username}`}
            className="rounded-lg p-1 transition hover:bg-surface-800"
            aria-label="Your profile"
          >
            <Avatar user={user} size="xs" alt="" />
          </Link>
        </div>
      </header>

      <main
        id="main"
        className={
          isReels
            ? "h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom))] overflow-hidden lg:h-dvh lg:pl-60"
            : "px-4 pt-5 pb-28 sm:px-6 lg:pt-8 lg:pb-12 lg:pl-64"
        }
      >
        <div className={isReels ? "h-full w-full" : "mx-auto w-full max-w-6xl"}>{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line-700 bg-surface-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} item={item} layout="tab" />
        ))}
      </nav>
    </div>
  );
}
