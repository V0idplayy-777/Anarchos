import { ConvexHttpClient } from "convex/browser";
import { ConvexReactClient } from "convex/react";

export const CONVEX_URL =
  import.meta.env.VITE_CONVEX_URL ?? "https://veracious-lynx-275.convex.cloud";

/** Reactive client used by useQuery / useMutation hooks. */
export const convex = new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false });

/** One-off imperative calls (sign in, upload, logout) with catchable errors. */
export const http = new ConvexHttpClient(CONVEX_URL);

const CODE_COPY = {
  UNAUTHENTICATED: "You need to be signed in to do that.",
  FORBIDDEN: "You do not have permission to do that.",
  NOT_FOUND: "That content is no longer available.",
  CONFLICT: "That change conflicts with an existing record.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  BAD_REQUEST: "That request could not be completed.",
};

/**
 * Turns a Convex / network failure into a single readable sentence.
 * Stack traces, request ids and internal details are never surfaced.
 */
export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  const data = error.data;
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object" && typeof data.message === "string") {
    return data.message;
  }
  if (data && typeof data === "object" && typeof data.code === "string") {
    return CODE_COPY[data.code] ?? fallback;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Check your connection and try again.";
  }
  let message = typeof error.message === "string" ? error.message : "";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Network problem. Check your connection and try again.";
  }
  message = message.replace(/\[Request ID:[^\]]*\]\s*/gi, "");
  message = message.replace(/^uncaught error:?\s*/i, "");
  message = message.replace(/^\[convex [^\]]*\]\s*/i, "");
  message = message.replace(/^error:?\s*/i, "");
  message = message.split("\n")[0].trim();
  if (!message || /server error|internal/i.test(message)) return fallback;
  return message.slice(0, 240);
}

export function getErrorCode(error) {
  return error?.data?.code ?? null;
}
