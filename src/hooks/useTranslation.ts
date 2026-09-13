import { useSettings } from "@/context/SettingsContext";
import { translations } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

export function useTranslation() {
  const { language } = useSettings();

  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  return { t, lang: language };
}