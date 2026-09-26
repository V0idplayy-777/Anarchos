import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getErrorMessage, http } from "../lib/convex";
import { useAuth } from "../lib/session";
import { useToast } from "../lib/toast";
import { uploadToConvex } from "../lib/upload";
import { useRouter } from "../lib/router";
import { Avatar, Button, Field, Input, Modal, PageHeader, Textarea } from "../components/ui";
import { IconCamera, IconDocument, IconLogout, IconShield, IconTrash, IconUser } from "../components/icons";
import { useTheme } from "../lib/theme";

const USERNAME_MAX = 24;
const DISPLAY_MAX = 40;
const BIO_MAX = 400;

export function SettingsPage() {
  const { token, user, refresh, signOut } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef(null);

  const profile = useQuery(
    api.users.getByUsername,
    token && user?.username ? { username: user.username, token } : "skip"
  );
  const updateProfile = useMutation(api.users.updateProfile);
  const removeAvatar = useMutation(api.users.removeAvatar);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.user.username);
    setDisplayName(profile.user.displayName ?? "");
    setBio(profile.user.bio ?? "");
  }, [profile]);

  const avatarUrl = profile?.user?.avatarUrl ?? null;

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await updateProfile({
        token,
        username,
        displayName,
        bio,
      });
      await refresh();
      toast.push("Profile updated.", "success");
    } catch (error) {
      const message = getErrorMessage(error);
      setFormError(message);
      toast.push(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.push("Profile pictures must be image files.", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.push("Profile pictures must be 8 MB or smaller.", "error");
      return;
    }
    setUploadingAvatar(true);
    try {
      const uploadUrl = await http.mutation(api.users.generateAvatarUploadUrl, { token });
      const stored = await uploadToConvex(uploadUrl, file);
      await http.mutation(api.users.setAvatar, { token, storageId: stored.storageId });
      await refresh();
      toast.push("Profile picture updated.", "success");
    } catch (error) {
      toast.push(getErrorMessage(error), "error");
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await http.mutation(api.users.deleteAccount, { token });
      await signOut();
      toast.push("Your account has been deleted.", "info");
      router.navigate("/login");
    } catch (error) {
      toast.push(getErrorMessage(error), "error");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account, security and legal settings." />

      <section aria-labelledby="account-heading" className="card px-5 py-5">
        <h2 id="account-heading" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <IconUser className="size-4.5 text-brand-400" />
          Account
        </h2>

        <div className="mt-5 flex items-center gap-4">
          {profile ? (
            <Avatar user={{ ...profile.user, avatarUrl }} size="lg" />
          ) : (
            <span className="size-16 animate-pulse rounded-full bg-surface-800" />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={uploadingAvatar}
              onClick={() => fileRef.current?.click()}
              disabled={!profile}
            >
              <IconCamera className="size-4" />
              Change picture
            </Button>
            {avatarUrl ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={uploadingAvatar}
                onClick={async () => {
                  try {
                    await removeAvatar({ token });
                    await refresh();
                    toast.push("Profile picture removed.", "success");
                  } catch (error) {
                    toast.push(getErrorMessage(error), "error");
                  }
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => handleAvatarChange(event.target.files?.[0])}
          />
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          <Field
            label="Username"
            hint="3–24 characters. Letters, numbers, underscores, hyphens and pipes."
            htmlFor="settings-username"
          >
            <Input
              id="settings-username"
              value={username}
              maxLength={USERNAME_MAX}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              autoComplete="username"
              spellCheck={false}
            />
          </Field>

          <Field
            label="Display name"
            hint="Shown on your profile and next to your videos."
            htmlFor="settings-display-name"
            counter={`${displayName.length}/${DISPLAY_MAX}`}
          >
            <Input
              id="settings-display-name"
              value={displayName}
              maxLength={DISPLAY_MAX}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Add a display name"
            />
          </Field>

          <Field
            label="Bio"
            hint="Tell people what you post."
            htmlFor="settings-bio"
            counter={`${bio.length}/${BIO_MAX}`}
          >
            <Textarea
              id="settings-bio"
              value={bio}
              maxLength={BIO_MAX}
              rows={4}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Add a short bio"
            />
          </Field>

          {formError ? (
            <p className="text-sm text-brand-300" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={saving} disabled={!profile}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving || !profile}
              onClick={() => {
                setUsername(profile.user.username);
                setDisplayName(profile.user.displayName ?? "");
                setBio(profile.user.bio ?? "");
                setFormError(null);
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      </section>

      <AppearanceSection />

      <SecuritySection />

      <section aria-labelledby="legal-heading" className="card px-5 py-5">
        <h2 id="legal-heading" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <IconDocument className="size-4.5 text-brand-400" />
          Legal
        </h2>
        <p className="mt-3 text-sm text-zinc-400">
          Read the terms that govern your use of Anarchos.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => router.navigate("/terms")}
        >
          Terms of Service
        </Button>
      </section>

      <section
        aria-labelledby="danger-heading"
        className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-5"
      >
        <h2 id="danger-heading" className="flex items-center gap-2 text-sm font-semibold text-red-200">
          <IconTrash className="size-4.5" />
          Delete account
        </h2>
        <p className="mt-3 text-sm text-red-100/80">
          Deleting your account permanently removes your profile, videos, likes, comments, follows
          and messages. This cannot be undone.
        </p>
        <Button variant="danger" size="sm" className="mt-3" onClick={() => setDeleteOpen(true)}>
          Delete account
        </Button>
      </section>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={confirmText !== user?.username}
              onClick={handleDeleteAccount}
            >
              Permanently delete
            </Button>
          </>
        }
      >
        <p>
          This removes everything associated with <strong>@{user?.username}</strong>, including
          uploaded video files. Other people's posts and messages are kept, but your contributions
          are removed and your follow relationships are deleted.
        </p>
        <label htmlFor="delete-confirm" className="mt-4 block text-sm text-zinc-300">
          Type your username to confirm
        </label>
        <Input
          id="delete-confirm"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder={user?.username}
          className="mt-1.5"
          autoComplete="off"
        />
      </Modal>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <section aria-labelledby="appearance-heading" className="card px-5 py-5">
      <h2 id="appearance-heading" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <span className="text-base">{theme === "dark" ? "🌙" : "☀️"}</span> Appearance
      </h2>
      <p className="mt-3 text-sm text-zinc-400">Choose between dark and light theme. Dark is well-done; light broadens appeal for daytime use.</p>
      <div className="mt-4 flex gap-2">
        <Button variant={theme === "dark" ? "primary" : "secondary"} size="sm" onClick={() => setTheme("dark")}>
          🌙 Dark
        </Button>
        <Button variant={theme === "light" ? "primary" : "secondary"} size="sm" onClick={() => setTheme("light")}>
          ☀️ Light
        </Button>
      </div>
    </section>
  );
}

function SecuritySection() {
  const { token, signOut } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(null);

  async function handleChangePassword(event) {
    event.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await http.action(api.authActions.changePassword, {
        token,
        currentPassword: current,
        newPassword: next,
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.push("Password updated. Other sessions were signed out.", "success");
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
      toast.push(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.navigate("/login");
  }

  return (
    <section aria-labelledby="security-heading" className="card px-5 py-5">
      <h2 id="security-heading" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <IconShield className="size-4.5 text-brand-400" />
        Security
      </h2>

      <form onSubmit={handleChangePassword} className="mt-5 space-y-4">
        <Field
          label="Current password"
          htmlFor="current-password"
          hint="Changing your password signs out every other device."
        >
          <Input
            id="current-password"
            type="password"
            value={current}
            autoComplete="current-password"
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="New password"
            htmlFor="new-password"
            hint="At least 6 characters."
          >
            <Input
              id="new-password"
              type="password"
              value={next}
              autoComplete="new-password"
              onChange={(event) => setNext(event.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password">
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
        </div>
        {error ? (
          <p className="text-sm text-brand-300" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={saving} disabled={!current || !next || !confirm}>
          Update password
        </Button>
      </form>

      <div className="mt-6 space-y-3 border-t border-line-700 pt-5">
        <p className="text-sm text-zinc-400">
          Sessions expire automatically after 30 days of inactivity.
        </p>
        <Button variant="secondary" size="sm" loading={signingOut} onClick={handleSignOut}>
          <IconLogout className="size-4" />
          Log out
        </Button>
      </div>
    </section>
  );
}
