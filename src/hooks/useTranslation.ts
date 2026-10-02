import { useSettings } from "@/context/SettingsContext";
import { translations } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

export function useTranslation() {
  const { language } = useSettings();

  // Defensive: settings may not be hydrated from AsyncStorage yet on the first
  // render, or may hold a corrupted value. Fall back to "en" instead of
  // indexing `translations[language]` with an unknown key.
  const lang = language === "ha" ? "ha" : "en";

  const t = (key: TranslationKey): string => {
    return translations[lang][key] || translations.en[key] || key;
  };

  return { t, lang };
}
