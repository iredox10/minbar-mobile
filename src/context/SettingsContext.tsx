import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Language } from "@/lib/i18n";

export type ThemeMode = "dark" | "light" | "system";

interface SettingsContextValue {
  themeMode: ThemeMode;
  isDark: boolean;
  language: Language;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguage: (lang: Language) => void;
}

const STORAGE_KEY = "arewa-settings";

interface PersistedSettings {
  themeMode: ThemeMode;
  language: Language;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("dark");
  const [language, setLanguageState] = useState<Language>("en");

  // Web app defaults to dark; also respect a previously persisted choice.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedSettings;
          if (parsed.themeMode) setThemeModeState(parsed.themeMode);
          if (parsed.language) setLanguageState(parsed.language);
        }
      } catch {
        // Ignore corrupted settings; fall back to defaults.
      }
    })();
  }, []);

  const persist = useCallback((next: PersistedSettings) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      persist({ themeMode: mode, language });
    },
    [persist, language],
  );

  const setLanguage = useCallback(
    (lang: Language) => {
      setLanguageState(lang);
      persist({ themeMode, language: lang });
    },
    [persist, themeMode],
  );

  const isDark =
    themeMode === "dark" || (themeMode === "system" && systemScheme === "dark");

  return (
    <SettingsContext.Provider
      value={{ themeMode, isDark, language, setThemeMode, setLanguage }}
    >
      {children}
    </SettingsContext.Provider>
  );
}