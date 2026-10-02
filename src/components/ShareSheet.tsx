import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  Share,
  Switch,
  Text,
  View,
} from "react-native";
import { Check, Copy, Image as ImageIcon, QrCode, Share2, X } from "lucide-react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

import { useTranslation } from "@/hooks/useTranslation";
import { copyLink, type ShareTarget } from "@/lib/share";
import { saveImageToLibrary } from "@/lib/saveImage";
import { ShareCard } from "./ShareCard";

interface Props {
  /** Controls modal visibility. */
  visible: boolean;
  /** Share payload built with episodeTarget()/seriesTarget()/speakerTarget()/playlistTarget(). Null renders nothing. */
  target: ShareTarget | null;
  onClose: () => void;
  onShared?: () => void;
}

/**
 * Bottom-sheet share dialog — parity with web `ShareSheet`:
 * "Share Link" path + "Create Share Card" image path (PNG capture + QR).
 */
export function ShareSheet({ visible, target, onClose, onShared }: Props) {
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [includeQR, setIncludeQR] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharingFile, setSharingFile] = useState(false);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (!visible) {
      setSharing(false);
      setCopying(false);
      setCopied(false);
      setGenerating(false);
      setPreviewUri(null);
      setSaving(false);
      setSharingFile(false);
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

  const handleGenerateCard = async () => {
    setGenerating(true);
    try {
      // Let layout + remote artwork settle (web parity: 300ms delay).
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!cardRef.current) throw new Error("Card ref not available");
      const uri = await captureRef(cardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      setPreviewUri(uri);
    } catch (error) {
      console.error("Failed to generate share card:", error);
      Alert.alert(t("share"), t("clipGenFailed"));
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveImage = async () => {
    if (!previewUri) return;
    setSaving(true);
    try {
      const result = await saveImageToLibrary(previewUri, target.title);
      if (result === "saved") {
        Alert.alert(t("share"), t("imageSaved"));
      } else if (result === "shared") {
        Alert.alert(t("share"), t("imageSavedViaShare"));
      } else if (result === "permission-denied") {
        Alert.alert(t("share"), t("savePermissionDenied"));
      } else {
        Alert.alert(t("share"), t("saveUnavailable"));
      }
    } catch (error) {
      console.error("Failed to save share card:", error);
      Alert.alert(t("share"), t("saveUnavailable"));
    } finally {
      setSaving(false);
    }
  };

  const handleShareImage = async () => {
    if (!previewUri) return;
    setSharingFile(true);
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(previewUri, {
          mimeType: "image/png",
          dialogTitle: target.title,
        });
        onShared?.();
      } else {
        await Share.share({ title: target.title, message: target.message, url: target.webUrl });
      }
    } catch {
      // dismissal — no-op
    } finally {
      setSharingFile(false);
    }
  };

  const handleReset = () => setPreviewUri(null);

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

          {!previewUri ? (
            <>
              {/* Title + link preview */}
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

              {/* Create Share Card */}
              <Pressable
                onPress={handleGenerateCard}
                disabled={generating}
                className="mb-2.5 flex-row items-center gap-4 rounded-2xl bg-slate-800/50 p-4 active:opacity-80 dark:bg-slate-800/50"
              >
                <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
                  {generating ? (
                    <ActivityIndicator color="#d4a853" />
                  ) : (
                    <ImageIcon size={24} color="#d4a853" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-medium text-slate-900 dark:text-slate-100">
                    {generating ? t("fetchingAudio") : t("shareClip")}
                  </Text>
                  <Text className="text-sm text-slate-500 dark:text-slate-400">
                    {t("shareCaptionPreview")}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => setIncludeQR((v) => !v)}
                  className="flex-row items-center gap-1.5"
                >
                  <QrCode size={16} color="#94a3b8" />
                  <Switch
                    value={includeQR}
                    onValueChange={setIncludeQR}
                    thumbColor="#0f172a"
                    trackColor={{ false: "#334155", true: "#d4a853" }}
                  />
                </Pressable>
              </Pressable>

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

              {/* Hidden capture node (must stay mounted, collapsable=false) */}
              <View style={{ position: "absolute", left: -9999, top: 0 }} pointerEvents="none">
                <ShareCard
                  ref={cardRef}
                  title={target.title}
                  subtitle={target.subtitle}
                  badge={target.badge}
                  artworkUri={target.artworkUri}
                  qrValue={includeQR ? target.webUrl : undefined}
                  showQR={includeQR}
                />
              </View>
            </>
          ) : (
            <>
              <View className="mb-4 overflow-hidden rounded-2xl bg-slate-800">
                <Image source={{ uri: previewUri }} style={{ width: "100%", aspectRatio: 1 }} resizeMode="contain" />
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
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 active:opacity-90"
                >
                  {sharingFile ? (
                    <ActivityIndicator color="#0f172a" />
                  ) : (
                    <Share2 size={18} color="#0f172a" />
                  )}
                  <Text className="font-semibold text-slate-900">{t("share")}</Text>
                </Pressable>
              </View>
              <Pressable onPress={handleReset} className="mt-2 py-3">
                <Text className="text-center text-sm text-slate-400">{t("redo")}</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
