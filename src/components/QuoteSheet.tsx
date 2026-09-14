import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image as ImageIcon, Quote, X } from "lucide-react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library";

import { useTranslation } from "@/hooks/useTranslation";
import { getEpisodeLinks } from "@/lib/share";

interface Props {
  visible: boolean;
  episodeId: string;
  episodeTitle: string;
  speakerName?: string;
  onClose: () => void;
}

/** Quote share with text path + PNG card capture (web QuoteCardSheet parity). */
export function QuoteSheet({ visible, episodeId, episodeTitle, speakerName, onClose }: Props) {
  const { t } = useTranslation();
  const [quote, setQuote] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharingFile, setSharingFile] = useState(false);
  const cardRef = useRef<View>(null);

  const trimmed = quote.trim();

  const messageFor = () => {
    const links = getEpisodeLinks(episodeId);
    const attribution = speakerName ? ` — ${speakerName}` : "";
    return {
      links,
      message: `"${trimmed}"${attribution}\nFrom "${episodeTitle}" on Arewa Central\n${links.webUrl}\n${links.deepLink}`,
    };
  };

  const handleShareText = async () => {
    if (!trimmed) return;
    const { links, message } = messageFor();
    try {
      await Share.share({ title: episodeTitle, message, url: links.webUrl });
      onClose();
    } catch {
      // dismissal — no-op
    }
  };

  const handleGenerateImage = async () => {
    if (!trimmed) return;
    setGenerating(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!cardRef.current) throw new Error("Card ref not available");
      const uri = await captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" });
      setPreviewUri(uri);
    } catch (error) {
      console.error("Failed to generate quote card:", error);
      Alert.alert(t("shareClip"), t("clipGenFailed"));
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveImage = async () => {
    if (!previewUri) return;
    setSaving(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) return;
      await MediaLibrary.saveToLibraryAsync(previewUri);
      Alert.alert(t("shareClip"), t("clipDownloaded"));
    } catch (error) {
      console.error("Failed to save quote card:", error);
      Alert.alert(t("shareClip"), t("downloadFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleShareImage = async () => {
    if (!previewUri) return;
    setSharingFile(true);
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(previewUri, { mimeType: "image/png", dialogTitle: episodeTitle });
      } else {
        await handleShareText();
      }
    } catch {
      // dismissal — no-op
    } finally {
      setSharingFile(false);
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

          {!previewUri ? (
            <>
              {trimmed ? (
                <View ref={cardRef} collapsable={false} className="mb-4 rounded-2xl bg-slate-950 p-5">
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
                  <Text className="mt-2 text-center text-[10px] text-slate-500">
                    Arewa Central — Free. No Ads.
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

              <View className="flex-row gap-2.5">
                <Pressable
                  onPress={handleShareText}
                  disabled={!trimmed}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3.5 active:opacity-90 ${trimmed ? "bg-primary" : "bg-slate-700/40"}`}
                >
                  <Quote size={18} color={trimmed ? "#0f172a" : "#64748b"} />
                  <Text className={`text-[15px] font-semibold ${trimmed ? "text-slate-900" : "text-slate-500"}`}>
                    {t("share")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleGenerateImage}
                  disabled={!trimmed || generating}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 py-3.5 active:opacity-80 dark:border-slate-700"
                >
                  {generating ? (
                    <ActivityIndicator color="#d4a853" />
                  ) : (
                    <ImageIcon size={18} color="#94a3b8" />
                  )}
                  <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t("shareCaptionPreview")}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View className="mb-4 overflow-hidden rounded-2xl bg-slate-800">
                <Image source={{ uri: previewUri }} style={{ width: "100%", aspectRatio: 1.4 }} resizeMode="contain" />
              </View>
              <View className="flex-row gap-2.5">
                <Pressable
                  onPress={handleSaveImage}
                  disabled={saving}
                  className="flex-1 items-center rounded-2xl bg-slate-800 py-3.5 active:opacity-80"
                >
                  {saving ? (
                    <ActivityIndicator color="#d4a853" />
                  ) : (
                    <Text className="font-medium text-slate-200">{t("download")}</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={handleShareImage}
                  disabled={sharingFile}
                  className="flex-1 items-center rounded-2xl bg-primary py-3.5 active:opacity-90"
                >
                  {sharingFile ? (
                    <ActivityIndicator color="#0f172a" />
                  ) : (
                    <Text className="font-semibold text-slate-900">{t("share")}</Text>
                  )}
                </Pressable>
              </View>
              <Pressable onPress={() => setPreviewUri(null)} className="mt-2 py-3">
                <Text className="text-center text-sm text-slate-400">{t("redo")}</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
