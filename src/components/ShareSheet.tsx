import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Share, Text, View } from "react-native";
import { Check, Copy, Share2, X } from "lucide-react-native";

import { useTranslation } from "@/hooks/useTranslation";
import { copyLink, type ShareTarget } from "@/lib/share";

interface Props {
  /** Controls modal visibility. */
  visible: boolean;
  /** Share payload built with episodeTarget()/seriesTarget()/speakerTarget()/playlistTarget(). Null renders nothing. */
  target: ShareTarget | null;
  onClose: () => void;
  onShared?: () => void;
}

/**
 * Bottom-sheet share dialog — mobile parity with web `ShareSheet` "Share Link"
 * path (QR / share-card image intentionally skipped, keep simple).
 */
export function ShareSheet({ visible, target, onClose, onShared }: Props) {
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSharing(false);
      setCopying(false);
      setCopied(false);
    }
  }, [visible]);

  if (!target) return null;

  const handleShare = async () => {
    setSharing(true);
    try {
      await Share.share({ title: target.title, message: target.message, url: target.webUrl });
      onShared?.();
    } catch {
      // User dismissal / unavailable share sheet — stay open, no crash.
    } finally {
      setSharing(false);
    }
  };

  const handleCopy = async () => {
    setCopying(true);
    try {
      const ok = await copyLink(target.webUrl);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } finally {
      setCopying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-slate-950/60" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="mt-auto rounded-t-3xl border-t border-slate-800 bg-white p-6 pb-10 dark:bg-slate-900"
        >
          <View className="mb-1 h-1 w-10 self-center rounded-full bg-slate-300 dark:bg-slate-700" />

          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Share2 size={20} color="#d4a853" />
              <Text className="text-lg font-bold text-slate-900 dark:text-white">
                {t("share")}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#94a3b8" />
            </Pressable>
          </View>

          {/* Title + link preview (selectable so manual copy always works,
              even when the optional expo-clipboard dep is not installed). */}
          <View className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <Text
              className="text-[15px] font-semibold text-slate-900 dark:text-slate-100"
              numberOfLines={2}
            >
              {target.title}
            </Text>
            {target.subtitle ? (
              <Text className="mt-0.5 text-sm text-primary" numberOfLines={1}>
                {target.subtitle}
              </Text>
            ) : null}
            <Text selectable className="mt-2 text-[13px] text-sky-600 dark:text-sky-400">
              {target.webUrl}
            </Text>
            <Text selectable className="mt-0.5 text-xs text-slate-400">
              {target.deepLink}
            </Text>
          </View>

          <View className="flex-row gap-2.5">
            <Pressable
              onPress={handleShare}
              disabled={sharing}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 active:opacity-90"
            >
              {sharing ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <Share2 size={18} color="#0f172a" />
              )}
              <Text className="text-[15px] font-semibold text-slate-900">
                {t("share")}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleCopy}
              disabled={copying}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
            >
              {copying ? (
                <ActivityIndicator color="#d4a853" />
              ) : copied ? (
                <Check size={18} color="#22c55e" />
              ) : (
                <Copy size={18} color="#94a3b8" />
              )}
              <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {copied ? t("copied") : t("copy")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
