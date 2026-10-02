import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OAuthProvider } from "appwrite";

import { account, isAppwriteConfigured } from "@/lib/appwrite";
import { syncUserData } from "@/lib/sync";
import type { User } from "@/types";

interface UserContextValue {
  user: User | null;
  loading: boolean;
  following: string[];
  login: (provider: OAuthProvider) => Promise<void>;
  logout: () => Promise<void>;
  updateLanguage: (lang: "en" | "ha") => Promise<void>;
  toggleFollow: (speakerId: string) => Promise<void>;
}

const FOLLOWING_KEY = "arewa-following";

const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<string[]>([]);
  const linkingSubRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(FOLLOWING_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setFollowing(parsed.filter((id): id is string => typeof id === "string"));
          }
        } catch {
          // Corrupt cache: ignore and start fresh.
        }
      })
      .catch(() => {});
  }, []);

  const checkUser = useCallback(async () => {
    if (!isAppwriteConfigured()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const session = await account.get();
      const prefs = await account.getPrefs();
      setUser({ ...session, prefs } as User);
      const serverFollowing = (prefs as { following?: unknown } | undefined)?.following;
      if (Array.isArray(serverFollowing)) {
        const ids = serverFollowing.filter((id): id is string => typeof id === "string");
        // Server prefs are authoritative (web parity: follows live only in prefs),
        // so replace — never union — otherwise an unfollow on web is resurrected.
        setFollowing(ids);
        AsyncStorage.setItem(FOLLOWING_KEY, JSON.stringify(ids)).catch(() => {});
      }
      // Best-effort library roaming (web parity with minbar sync.ts).
      syncUserData(session.$id).catch(() => {});
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  // Complete the OAuth session when the success deep link (arewa://auth?userId=…&secret=…)
  // arrives after the user authenticates in the system browser.
  const completeOAuth = useCallback(
    async (url: string) => {
      if (!url.startsWith("arewa://")) return;
      const { queryParams } = Linking.parse(url);
      const userId = queryParams?.userId;
      const secret = queryParams?.secret;
      if (typeof userId !== "string" || typeof secret !== "string") return;
      try {
        await account.createSession({ userId, secret });
        await checkUser();
      } catch (error) {
        console.error("OAuth session creation failed:", error);
      }
    },
    [checkUser],
  );

  const listenForOAuthReturn = useCallback(() => {
    linkingSubRef.current?.remove();
    linkingSubRef.current = Linking.addEventListener("url", (event) => {
      completeOAuth(event.url).catch(console.error);
    });
    Linking.getInitialURL().then((url) => {
      if (url) completeOAuth(url).catch(console.error);
    });
  }, [completeOAuth]);

  useEffect(() => {
    if (!isAppwriteConfigured()) return;
    listenForOAuthReturn();
    return () => linkingSubRef.current?.remove();
  }, [listenForOAuthReturn]);

  const login = useCallback(
    async (provider: OAuthProvider) => {
      try {
        const redirectUri = Linking.createURL("auth-callback");
        const url = account.createOAuth2Session({
          provider,
          success: redirectUri,
          failure: redirectUri,
        }) as string;
        await Linking.openURL(url);
      } catch (error) {
        console.error("Login failed:", error);
        throw error;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await account.deleteSession("current");
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
    // Always clear follow state/cache so the next account on a shared device
    // doesn't inherit this one's follows.
    setFollowing([]);
    AsyncStorage.removeItem(FOLLOWING_KEY).catch(() => {});
  }, []);

  const updateLanguage = useCallback(
    async (lang: "en" | "ha") => {
      if (!user) return;
      try {
        const newPrefs = { ...user.prefs, language: lang };
        await account.updatePrefs(newPrefs);
        setUser({ ...user, prefs: newPrefs });
      } catch (error) {
        console.error("Failed to update language preference:", error);
      }
    },
    [user],
  );

  const toggleFollow = useCallback(
    async (speakerId: string) => {
      const prev = await AsyncStorage.getItem(FOLLOWING_KEY).catch(() => null);
      let current: string[] = following;
      if (prev) {
        try {
          const parsed = JSON.parse(prev);
          if (Array.isArray(parsed)) {
            current = parsed.filter((id): id is string => typeof id === "string");
          }
        } catch {
          // Fall back to in-memory state on corrupt cache.
        }
      }
      const newFollowing = current.includes(speakerId)
        ? current.filter((id) => id !== speakerId)
        : [...current, speakerId];

      setFollowing(newFollowing);
      AsyncStorage.setItem(FOLLOWING_KEY, JSON.stringify(newFollowing)).catch(() => {});

      if (!user) return;
      try {
        const newPrefs = { ...user.prefs, following: newFollowing };
        await account.updatePrefs(newPrefs);
        setUser({ ...user, prefs: newPrefs });
      } catch (error) {
        console.error("Failed to update following:", error);
      }
    },
    [following, user],
  );

  return (
    <UserContext.Provider
      value={{ user, loading, following, login, logout, updateLanguage, toggleFollow }}
    >
      {children}
    </UserContext.Provider>
  );
}