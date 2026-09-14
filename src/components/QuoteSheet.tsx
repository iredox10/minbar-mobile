import { useState } from "react";
import { Modal, Pressable, Share, Text, TextInput, View } from "react-native";
import { Quote, X } from "lucide-react-native";

import { useTranslation } from "@/hooks/useTranslation";
import { getEpisodeLinks } from "@/lib/share";

interface Props {
  visible: boolean;
  episodeId: string;
  episodeTitle: string;
  speakerName?: string;
  onClose: () => void;
}

/**
 * Text-quote share (web parity with QuoteCardSheet's text path).
 * Image capture (styled card PNG + QR) is a follow-up needing
 * react-native-view-shot + expo-sharing + dev build.
 */
export function QuoteSheet({ visible, episodeId, episodeTitle, speakerName, onClose }: Props) {
  const { t } = useTranslation();
  const [quote, setQuote] = useState("");

  const trimmed = quote.trim();

  const handleShare = async () => {
    if (!trimmed) return;
    const links = getEpisodeLinks(episodeId);
    const attribution = speakerName ? ` — ${speakerName}` : "";
    try {
      await Share.share({
        title: episodeTitle,
        message: `"${trimmed}"${attribution}\nFrom "${episodeTitle}" on Arewa Central\n${links.webUrl}\n${links.deepLink}`,
        url: links.webUrl,
      });
      onClose();
    } catch {
      // dismissal — no-op
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-slate-950/60" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="mt-auto rounded-t-3xl border-t border-slate-800 bg-white p-6 pb-10 dark:bg-slate-900"
        >
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Quote size={20} color="#d4a853" />
              <Text className="text-lg font-bold text-slate-900 dark:text-white">
                {t("shareClip")}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#94a3b8" />
            </Pressable>
          </View>

          {trimmed ? (
            <View className="mb-4 rounded-2xl bg-slate-950 p-5">
              <Text className="text-center text-lg font-semibold italic leading-relaxed text-amber-100">
                “{trimmed}”
              </Text>
              {speakerName ? (
                <Text className="mt-3 text-center text-sm font-medium text-primary">
                  — {speakerName}
                </Text>
              ) : null}
              <Text className="mt-1 text-center text-xs text-slate-400" numberOfLines={1}>
                {episodeTitle}
              </Text>
            </View>
          ) : null}

          <TextInput
            className="mb-4 min-h-[96px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-900 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-100"
            value={quote}
            onChangeText={setQuote}
            placeholder={t("copyText")}
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
          />

          <Pressable
            onPress={handleShare}
            disabled={!trimmed}
            className={`flex-row items-center justify-center gap-2 rounded-2xl py-3.5 active:opacity-90 ${trimmed ? "bg-primary" : "bg-slate-700/40"}`}
          >
            <Quote size={18} color={trimmed ? "#0f172a" : "#64748b"} />
            <Text className={`text-[15px] font-semibold ${trimmed ? "text-slate-900" : "text-slate-500"}`}>
              {t("share")}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
