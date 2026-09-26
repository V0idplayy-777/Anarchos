import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const ToastContext = createContext({ push: () => {} });
let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, kind = "info") => {
      const text = typeof message === "string" ? message : String(message ?? "");
      if (!text.trim()) return;
      counter += 1;
      const id = counter;
      setToasts((current) => [...current.slice(-2), { id, message: text, kind }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), kind === "error" ? 6000 : 4200)
      );
      return id;
    },
    [dismiss]
  );

  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-100 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              toast.kind === "error"
                ? "border-brand-600/50 bg-brand-700/20 text-red-100"
                : toast.kind === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-50"
                  : "border-line-600 bg-surface-800/95 text-zinc-100"
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                toast.kind === "error"
                  ? "bg-brand-400"
                  : toast.kind === "success"
                    ? "bg-emerald-400"
                    : "bg-zinc-400"
              }`}
            />
            <p className="flex-1 leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded p-0.5 text-zinc-400 transition hover:text-zinc-100"
              aria-label="Dismiss notification"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
