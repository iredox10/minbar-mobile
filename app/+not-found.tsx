import { Link } from "expo-router";
import { Text, View } from "react-native";

import { useTranslation } from "@/hooks/useTranslation";

// Local copy for the generic 404 screen. i18n.ts is owned by another agent and
// has no `pageNotFound` key yet; move these there when that key is added.
const NOT_FOUND_TITLE = "Page not found";
const NOT_FOUND_DESC =
  "This screen doesn't exist or has moved. It may no longer be part of the app.";

export default function NotFoundScreen() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center bg-slate-100 px-6 dark:bg-slate-900">
      <Text className="text-3xl font-bold text-slate-900 dark:text-white">
        404
      </Text>
      <Text className="mt-2 text-slate-500 dark:text-slate-400">
        {NOT_FOUND_TITLE}
      </Text>
      <Text className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
        {NOT_FOUND_DESC}
      </Text>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-primary px-5 py-2.5 font-medium text-slate-900"
      >
        {t("goHome")}
      </Link>
    </View>
  );
}