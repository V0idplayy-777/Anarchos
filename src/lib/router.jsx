import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const RouterContext = createContext({
  path: "/",
  navigate: () => {},
  replace: () => {},
  back: () => {},
});

function readHash() {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function RouterProvider({ children }) {
  const [path, setPath] = useState(readHash);

  useEffect(() => {
    const onHashChange = () => {
      setPath(readHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.replace("#/");
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const next = to.startsWith("/") ? to : `/${to}`;
    if (readHash() === next) {
      window.scrollTo({ top: 0 });
      return;
    }
    if (replace) {
      window.location.replace(`#${next}`);
    } else {
      window.location.hash = next;
    }
  }, []);

  /** Navigates without adding a history entry. */
  const replace = useCallback((to) => navigate(to, { replace: true }), [navigate]);

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigate("/");
  }, [navigate]);

  const value = useMemo(
    () => ({ path, navigate, replace, back }),
    [path, navigate, replace, back]
  );
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  return useContext(RouterContext);
}

export function Link({ to, children, onClick, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${to.startsWith("/") ? to : `/${to}`}`}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
          return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Splits "/u/alice/clips" into ["u", "alice", "clips"]. */
export function segments(path) {
  return path.split("?")[0].split("/").filter(Boolean);
}

export function useSegments() {
  const { path } = useRouter();
  return useMemo(() => segments(path), [path]);
}
