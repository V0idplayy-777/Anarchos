import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getErrorMessage } from "../lib/convex";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { useRouter } from "../lib/router";
import { Link } from "../lib/router";
import { Avatar, Button, Field, Input, Tabs } from "../components/ui";
import { IconCamera, IconClose } from "../components/icons";

const USERNAME_MAX = 24;
const DISPLAY_MAX = 40;

export function AuthPage({ initialMode = "login" }) {
  const { status, signIn, signUp, user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef(null);

  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (status === "signedIn" && user) router.replace("/");
  }, [status, user, router]);

  const trimmed = username.trim().toLowerCase();
  const usernameShapeValid = /^[a-z0-9_|-]{3,24}$/.test(trimmed);
  const availability = useQuery(
    api.auth.usernameAvailable,
    mode === "signup" && usernameShapeValid ? { username: trimmed } : "skip"
  );

  useEffect(() => {
    if (!avatarFile) {
      setAvatarUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function validate() {
    const errors = {};
    if (!trimmed) errors.username = "Enter a username.";
    else if (!usernameShapeValid)
      errors.username =
        "Use 3–24 characters: letters, numbers, underscores, hyphens and pipes. No spaces.";
    if (!password) errors.password = "Enter a password.";
    else if (password.length < 6) errors.password = "Password must be at least 6 characters.";
    else if (password.length > 777) errors.password = "Password must be 777 characters or fewer.";
    if (displayName.length > DISPLAY_MAX) errors.displayName = "Display name is too long.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { user: created } = await signUp({
          username: trimmed,
          password,
          displayName: displayName.trim(),
          avatarFile,
        });
        toast.push(`Welcome to Anarchos, @${created.username}.`, "success");
      } else {
        const { user: existing } = await signIn({ username: trimmed, password });
        toast.push(`Signed in as @${existing.username}.`, "success");
      }
      router.replace("/");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-950">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-lg bg-brand-600 text-xl font-bold text-white"
            >
              A
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50">Anarchos</h1>
            <p className="mt-1.5 max-w-xs text-sm text-zinc-500">
              A video-first community where you publish, follow and message people you actually know.
            </p>
          </div>

          <div className="card p-5 sm:p-6">
            <Tabs
              value={mode}
              onChange={(value) => {
                setMode(value);
                setError(null);
                setFieldErrors({});
              }}
              tabs={[
                { value: "login", label: "Sign in" },
                { value: "signup", label: "Create account" },
              ]}
              className="mb-5"
            />

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Field
                label="Username"
                htmlFor="auth-username"
                error={fieldErrors.username}
                hint={
                  mode === "signup"
                    ? "3–24 characters. Letters, numbers, underscores, hyphens and pipes."
                    : undefined
                }
              >
                <Input
                  id="auth-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  maxLength={USERNAME_MAX}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="yourname"
                  invalid={Boolean(fieldErrors.username)}
                  aria-describedby={
                    availability && !availability.available && availability.error
                      ? "auth-username-status"
                      : undefined
                  }
                />
              </Field>
              {mode === "signup" && trimmed && usernameShapeValid ? (
                <p
                  id="auth-username-status"
                  aria-live="polite"
                  className={`text-xs ${availability === undefined ? "text-zinc-500" : availability.available ? "text-emerald-400" : "text-brand-300"}`}
                >
                  {availability === undefined
                    ? "Checking availability…"
                    : availability.available
                      ? `@${trimmed} is available.`
                      : (availability.error ?? "That username is unavailable.")}
                </p>
              ) : null}

              {mode === "signup" ? (
                <div className="space-y-4">
                  <Field
                    label="Display name"
                    htmlFor="auth-display-name"
                    hint="Optional. Used instead of your username where there is room."
                    error={fieldErrors.displayName}
                    counter={`${displayName.length}/${DISPLAY_MAX}`}
                  >
                    <Input
                      id="auth-display-name"
                      value={displayName}
                      maxLength={DISPLAY_MAX}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="How should we show you?"
                      autoComplete="nickname"
                    />
                  </Field>

                  <div className="space-y-1.5">
                    <span className="text-sm font-medium text-zinc-200">Profile picture</span>
                    <div className="flex items-center gap-3">
                      <Avatar
                        user={{
                          displayName: displayName || username,
                          username: username || "new",
                          avatarUrl,
                        }}
                        size="md"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => fileRef.current?.click()}
                      >
                        <IconCamera className="size-4" />
                        Choose image
                      </Button>
                      {avatarFile ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => setAvatarFile(null)}
                        >
                          <IconClose className="size-4" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-500">Optional. JPG, PNG or WebP up to 8 MB.</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
              ) : null}

              <Field
                label="Password"
                htmlFor="auth-password"
                error={fieldErrors.password}
                hint={mode === "signup" ? "At least 6 characters." : undefined}
              >
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  invalid={Boolean(fieldErrors.password)}
                />
              </Field>

              {error ? (
                <p className="text-sm text-brand-300" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" loading={busy} size="lg">
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>

              {mode === "signup" ? (
                <p className="text-center text-xs leading-relaxed text-zinc-500">
                  By creating an account, you agree to the Anarchos{" "}
                  <Link
                    to="/terms"
                    className="font-medium text-brand-300 underline-offset-2 hover:underline"
                  >
                    Terms of Service
                  </Link>
                  .
                </p>
              ) : (
                <p className="text-center text-xs text-zinc-500">
                  <Link
                    to="/terms"
                    className="font-medium text-zinc-400 underline-offset-2 hover:underline"
                  >
                    Read the Terms of Service
                  </Link>
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
      <footer className="px-4 pb-6 text-center text-xs text-zinc-600">
        Video sharing, follows and direct messages, powered by Convex.
      </footer>
    </div>
  );
}
