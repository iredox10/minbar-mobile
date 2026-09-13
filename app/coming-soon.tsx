import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useTranslation } from "@/hooks/useTranslation";

export default function ComingSoonScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { title } = useLocalSearchParams<{ title: string }>();

  return (
    <Screen>
      <View className="mb-6 mt-1 flex-row items-center gap-3">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color="#94a3b8" />
        </Pressable>
        <Text className="text-xl font-bold text-slate-900 dark:text-white">
          {title as string}
        </Text>
      </View>

      <View className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-800/40">
        <Text className="text-center text-[15px] font-semibold text-slate-700 dark:text-slate-200">
          {title as string} — {t("loading")}
        </Text>
        <Text className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
          Wired to Appwrite data in Phase 1.
        </Text>
      </View>
    </Screen>
  );
}