import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Heart, Sparkles } from "lucide-react-native";

import { useAppSettings } from "@/hooks/useAppSettings";
import { useTranslation } from "@/hooks/useTranslation";

/** Emerald gradient-style support CTA shown when donations are enabled. */
export function SupportBanner({ enabled: enabledProp }: { enabled?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { settings, loading } = useAppSettings();
  const enabled = enabledProp ?? (loading ? null : settings.isDonationsEnabled);

  if (enabled === null || !enabled) return null;

  return (
    <View className="px-1 py-6">
      <View className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
        <View className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-500/20" />
        <View className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-primary/20" />

        <View className="relative z-10 flex-row items-start gap-4">
          <View className="mt-1 h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20">
            <Heart size={24} color="#34d399" fill="#34d399" />
          </View>

          <View className="flex-1">
            <View className="mb-1.5 flex-row items-center gap-1.5">
              <Text className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
                {t("keepAppRunning")}
              </Text>
              <Sparkles size={14} color="#fbbf24" />
            </View>
            <Text className="mb-4 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
              {t("supportUsDesc")}
            </Text>

            <Pressable
              onPress={() => router.push("/donate")}
              className="rounded-xl bg-emerald-500 px-4 py-2.5 active:opacity-90"
            >
              <Text className="text-center text-sm font-semibold text-slate-900">
                {t("donateNow")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}