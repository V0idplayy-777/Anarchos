import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../../convex/_generated/api";
import { http } from "./convex";
import { uploadToConvex } from "./upload";

const STORAGE_KEY = "anarchos.session.v1";

const AuthContext = createContext({
  status: "restoring",
  token: "",
  user: null,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  refresh: async () => {},
  setUser: () => {},
});

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() =>
    (window.localStorage.getItem(STORAGE_KEY) ?? "") ? "restoring" : "signedOut"
  );
  const [restoreError, setRestoreError] = useState(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setStatus("signedOut");
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setStatus("restoring");
    setRestoreError(null);
    http
      .query(api.auth.me, { token })
      .then((me) => {
        if (requestRef.current !== requestId) return;
        setUser(me);
        setStatus("signedIn");
      })
      .catch((error) => {
        if (requestRef.current !== requestId) return;
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* storage unavailable */
        }
        setToken("");
        setUser(null);
        setStatus("signedOut");
        setRestoreError(
          error?.data?.code === "UNAUTHENTICATED"
            ? null
            : "We could not confirm your session. Please sign in again."
        );
      });
  }, [token]);

  const adoptSession = useCallback((nextToken, nextUser) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextToken);
    } catch {
      /* storage unavailable — session will not survive a refresh */
    }
    setToken(nextToken);
    setUser(nextUser);
    setStatus("signedIn");
    setRestoreError(null);
  }, []);

  const signUp = useCallback(
    async ({ username, password, displayName, avatarFile }) => {
      const result = await http.action(api.authActions.signUp, {
        username,
        password,
        displayName: displayName || undefined,
      });
      if (avatarFile) {
        try {
          const uploadUrl = await http.mutation(api.users.generateAvatarUploadUrl, {
            token: result.token,
          });
          const stored = await uploadToConvex(uploadUrl, avatarFile);
          await http.mutation(api.users.setAvatar, {
            token: result.token,
            storageId: stored.storageId,
          });
          const me = await http.query(api.auth.me, { token: result.token });
          adoptSession(result.token, me);
          return { user: me };
        } catch {
          // The account exists even if the picture failed, so keep the session.
          adoptSession(result.token, result.user);
          throw new Error(
            "Your account was created, but the profile picture could not be uploaded."
          );
        }
      }
      adoptSession(result.token, result.user);
      return { user: result.user };
    },
    [adoptSession]
  );

  const signIn = useCallback(
    async ({ username, password }) => {
      const result = await http.action(api.authActions.logIn, { username, password });
      adoptSession(result.token, result.user);
      return { user: result.user };
    },
    [adoptSession]
  );

  const signOut = useCallback(async () => {
    const current = token;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setToken("");
    setUser(null);
    setStatus("signedOut");
    if (current) {
      try {
        await http.mutation(api.auth.logOut, { token: current });
      } catch {
        /* session is already gone client-side */
      }
    }
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return null;
    try {
      const me = await http.query(api.auth.me, { token });
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, [token]);

  const value = useMemo(
    () => ({
      status,
      token,
      user,
      restoreError,
      signIn,
      signUp,
      signOut,
      refresh,
      setUser,
    }),
    [status, token, user, restoreError, signIn, signUp, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useOptionalToken() {
  return useContext(AuthContext).token;
}
