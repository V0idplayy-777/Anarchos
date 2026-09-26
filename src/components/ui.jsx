import { useEffect, useId, useRef } from "react";
import { cn } from "../utils/cn";
import { avatarHue, initials } from "../lib/format";
import { IconAlert, IconClose } from "./icons";

export function Spinner({ className, label }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}

const BUTTON_VARIANTS = {
  primary:
    "bg-brand-600 text-white border border-brand-500/60 hover:bg-brand-500 active:bg-brand-700 disabled:hover:bg-brand-600",
  secondary:
    "bg-surface-800 text-zinc-100 border border-line-600 hover:bg-surface-700 hover:border-zinc-600",
  ghost: "bg-transparent text-zinc-300 border border-transparent hover:bg-surface-800 hover:text-zinc-100",
  danger:
    "bg-transparent text-red-300 border border-red-500/40 hover:bg-red-500/10 hover:border-red-500/70",
};

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-lg",
  icon: "size-9 justify-center rounded-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors select-none",
        "disabled:cursor-not-allowed disabled:opacity-55",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, htmlFor, children, counter }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-200">
          {label}
        </label>
        {counter ? <span className="text-xs text-zinc-500">{counter}</span> : null}
      </div>
      {children}
      {hint && !error ? <p className="text-xs leading-relaxed text-zinc-500">{hint}</p> : null}
      {error ? (
        <p className="text-xs font-medium text-brand-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  "w-full rounded-lg border bg-surface-850 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors border-line-600 hover:border-zinc-600 focus:border-brand-500 focus:bg-surface-800 focus:outline-none disabled:opacity-60";

export function Input({ className, invalid, ...rest }) {
  return (
    <input
      className={cn(CONTROL_BASE, "h-10", invalid && "border-brand-500", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Textarea({ className, invalid, max, value, ...rest }) {
  return (
    <textarea
      className={cn(CONTROL_BASE, "min-h-24 resize-y leading-relaxed", invalid && "border-brand-500", className)}
      aria-invalid={invalid || undefined}
      maxLength={max}
      value={value}
      {...rest}
    />
  );
}

const AVATAR_SIZES = {
  xs: "size-7 text-[10px]",
  sm: "size-9 text-xs",
  md: "size-11 text-sm",
  lg: "size-16 text-lg",
  xl: "size-24 text-2xl",
};

export function Avatar({ user, size = "sm", className, alt }) {
  const name = user?.displayName || user?.username || "Anarchos member";
  const src = user?.avatarUrl;
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-600 bg-surface-800 font-semibold text-zinc-200",
        AVATAR_SIZES[size],
        className
      )}
      style={
        src
          ? undefined
          : {
              backgroundImage: `linear-gradient(140deg, hsl(${avatarHue(user?.username)} 26% 22%), hsl(${
                (avatarHue(user?.username) + 40) % 360
              } 18% 13%))`,
            }
      }
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? `${name}'s profile picture`}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}

export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-600 bg-surface-900/60 px-6 py-12 text-center",
        className
      )}
    >
      {icon ? (
        <span className="grid size-11 place-items-center rounded-full bg-surface-800 text-zinc-400">
          {icon}
        </span>
      ) : null}
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-zinc-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-brand-700/50 bg-brand-700/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <IconAlert className="mt-0.5 size-5 shrink-0 text-brand-300" />
        <div>
          <p className="text-sm font-medium text-red-100">Something went wrong</p>
          <p className="mt-0.5 text-sm text-red-200/80">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="shrink-0">
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-800", className)} aria-hidden="true" />;
}

export function Modal({ open, onClose, title, children, footer, labelledBy }) {
  const panelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-line-600 bg-surface-900 shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-700 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-zinc-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 rounded-md p-1 text-zinc-400 transition hover:bg-surface-800 hover:text-zinc-100"
          >
            <IconClose className="size-5" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-zinc-300">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-line-700 px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 overflow-x-auto rounded-lg border border-line-700 bg-surface-900 p-1", className)}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-surface-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className="ml-1.5 text-xs text-zinc-500">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({ title, description, action }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line-700 pb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Card({ as: Tag = "div", className, children, ...rest }) {
  return (
    <Tag className={cn("card", className)} {...rest}>
      {children}
    </Tag>
  );
}
