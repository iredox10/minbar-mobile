import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import {
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  HeartHandshake,
  Landmark,
} from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useTranslation } from "@/hooks/useTranslation";

export default function DonateScreen() {
  const { t } = useTranslation();
  const { settings, loading } = useAppSettings();
  const [copied, setCopied] = useState(false);

  const open = (url?: string) => {
    if (url) Linking.openURL(url).catch(() => {});
  };

  const handleCopyAccount = async (text: string) => {
    // Try expo-clipboard when available (optional dep), else fall back to Share.
    try {
      // Hidden from Metro's static resolver so the bundle doesn't fail when
      // expo-clipboard isn't installed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dynamicRequire = (0, eval)("require") as (m: string) => any;
      const modName = "expo-" + "clipboard";
      const Clipboard = dynamicRequire(modName);
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
      throw new Error("clipboard unavailable");
    } catch {
      try {
        await Share.share({ message: text });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Share dismissed — no-op.
      }
    }
  };

  const donationsEnabled = settings.isDonationsEnabled;

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
            <Text className="mb-2 text-center text-xl font-bold text-slate-900 dark:text-white">
              {t("supportArewaCentral")}
            </Text>
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
                  className="mb-3 rounded-2xl bg-primary p-4 active:opacity-90"
                >
                  <View className="flex-row items-center gap-3">
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-black/10">
                      <CreditCard size={22} color="#0f172a" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[15px] font-bold text-slate-900">
                        {t("paystack")}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-800">
                        {t("paystackDesc")}
                      </Text>
                    </View>
                    <ExternalLink size={18} color="#0f172a" />
                  </View>
                </Pressable>
              ) : null}

              {settings?.flutterwaveUrl ? (
                <Pressable
                  onPress={() => open(settings.flutterwaveUrl)}
                  className="mb-5 rounded-2xl border border-slate-300 p-4 active:opacity-80 dark:border-slate-700"
                >
                  <View className="flex-row items-center gap-3">
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-[#FB9129]/15">
                      <CreditCard size={22} color="#FB9129" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[15px] font-bold text-slate-900 dark:text-white">
                        {t("flutterwave")}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {t("flutterwaveDesc")}
                      </Text>
                    </View>
                    <ExternalLink size={18} color="#94a3b8" />
                  </View>
                </Pressable>
              ) : null}

              {settings?.bankName || settings?.accountName || settings?.accountNumber ? (
                <View className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <View className="mb-2 flex-row items-center gap-2">
                    <Landmark size={16} color="#d4a853" />
                    <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("directBankTransfer")}
                    </Text>
                  </View>
                  <Text className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                    {t("sendDirectlyNaira")}
                  </Text>
                  {settings.bankName ? (
                    <DetailRow label={t("bankName")} value={settings.bankName} />
                  ) : null}
                  {settings.accountName ? (
                    <DetailRow label={t("accountName")} value={settings.accountName} />
                  ) : null}
                  {settings.accountNumber ? (
                    <View className="py-1.5">
                      <Text className="mb-1 text-sm text-slate-500 dark:text-slate-400">
                        {t("accountNumber")}
                      </Text>
                      <View className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-slate-900/5 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                        <Text className="font-mono text-base tracking-wider text-emerald-600 dark:text-emerald-400">
                          {settings.accountNumber}
                        </Text>
                        <Pressable
                          onPress={() => handleCopyAccount(settings.accountNumber!)}
                          className="flex-row items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 active:opacity-80"
                        >
                          {copied ? (
                            <>
                              <CheckCircle2 size={16} color="#10b981" />
                              <Text className="text-sm font-medium text-emerald-500">
                                {t("copied")}
                              </Text>
                            </>
                          ) : (
                            <>
                              <Copy size={16} color="#cbd5e1" />
                              <Text className="text-sm font-medium text-slate-300">
                                {t("copy")}
                              </Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Text className="pt-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {t("jazakallahG")}
              </Text>
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
