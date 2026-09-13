import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { HeartHandshake, Landmark } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getAppSettings } from "@/lib/appwrite";

export default function DonateScreen() {
  const { t } = useTranslation();
  const { data: settings, loading } = useAsyncData(getAppSettings, []);

  const open = (url?: string) => {
    if (url) Linking.openURL(url).catch(() => {});
  };

  const donationsEnabled = settings?.isDonationsEnabled !== false;

  return (
    <Screen>
      <BackHeader title={t("supportUs")} />

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : (
        <>
          <View className="mb-5 items-center">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <HeartHandshake size={26} color="#d4a853" />
            </View>
            <Text className="text-center text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
              {t("supportDesc")}
            </Text>
          </View>

          {!donationsEnabled ? (
            <View className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <Text className="font-semibold text-slate-900 dark:text-white">
                {t("donationsPaused")}
              </Text>
              <Text className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {t("donationsPausedDesc")}
              </Text>
            </View>
          ) : (
            <>
              {settings?.paystackUrl ? (
                <Pressable
                  onPress={() => open(settings.paystackUrl)}
                  className="mb-3 rounded-2xl bg-primary py-3.5 active:opacity-90"
                >
                  <Text className="text-center text-[15px] font-semibold text-slate-900">
                    {t("paystack")}
                  </Text>
                </Pressable>
              ) : null}

              {settings?.flutterwaveUrl ? (
                <Pressable
                  onPress={() => open(settings.flutterwaveUrl)}
                  className="mb-5 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-300 py-3.5 active:opacity-80 dark:border-slate-700"
                >
                  <Text className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    {t("flutterwave")}
                  </Text>
                </Pressable>
              ) : null}

              {settings?.bankName || settings?.accountName || settings?.accountNumber ? (
                <View className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <View className="mb-2 flex-row items-center gap-2">
                    <Landmark size={16} color="#d4a853" />
                    <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("bankDetails")}
                    </Text>
                  </View>
                  {settings.bankName ? (
                    <DetailRow label={t("bankName")} value={settings.bankName} />
                  ) : null}
                  {settings.accountName ? (
                    <DetailRow label={t("accountName")} value={settings.accountName} />
                  ) : null}
                  {settings.accountNumber ? (
                    <DetailRow label={t("accountNumber")} value={settings.accountNumber} />
                  ) : null}
                </View>
              ) : null}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-sm text-slate-500 dark:text-slate-400">{label}</Text>
      <Text className="text-sm font-semibold text-slate-900 dark:text-white">{value}</Text>
    </View>
  );
}