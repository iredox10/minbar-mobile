import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Heart,
  Pause,
  Play,
  Radio as RadioIcon,
  Signal,
  Volume2,
  VolumeX,
} from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Artwork } from "@/components/Artwork";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { usePlayer } from "@/context/PlayerContext";
import { getRadioStations } from "@/lib/appwrite";
import { trackRadioStart } from "@/lib/analytics";
import type { RadioStation } from "@/types";

const LIKES_KEY = "arewa-radio-likes";

interface OptionalVolumeControls {
  volume?: number;
  isMuted?: boolean;
  setVolume?: (v: number) => void;
  toggleMute?: () => Promise<void> | void;
}

async function loadLikes(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(LIKES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export default function RadioScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const player = usePlayer() as ReturnType<typeof usePlayer> & OptionalVolumeControls;
  const { track, isPlaying, playTrackImmediately, togglePlay } = player;
  const { data, loading, error } = useAsyncData(getRadioStations, []);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    loadLikes().then(setLiked);
  }, []);

  const toggleLike = useCallback(async (stationId: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(stationId)) {
        next.delete(stationId);
      } else {
        next.add(stationId);
      }
      AsyncStorage.setItem(LIKES_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const isActiveStation = (station: RadioStation) => track?.id === station.$id;

  const handlePress = (station: RadioStation) => {
    if (isActiveStation(station)) {
      togglePlay();
      return;
    }
    trackRadioStart(station.$id, station.name);
    playTrackImmediately({
      id: station.$id,
      title: station.name,
      audioUrl: station.streamUrl,
      artworkUrl: station.logoUrl,
      duration: 0,
      type: "radio",
    });
    router.push("/player");
  };

  // Volume/mute is optional — PlayerContext on mobile currently exposes no
  // volume API, so skip gracefully when it isn't present (web parity).
  const hasVolumeControls =
    typeof player.volume === "number" && typeof player.setVolume === "function";
  const volume = typeof player.volume === "number" ? player.volume : 1;
  const isMuted = player.isMuted === true;
  const canToggleMute = typeof player.toggleMute === "function";
  const setVolume = player.setVolume;
  const toggleMute = player.toggleMute;
  const showVolumeBar =
    hasVolumeControls && track?.type === "radio" && isPlaying;

  const nowStreaming = track?.type === "radio" && isPlaying && track !== null;

  return (
    <Screen>
      <BackHeader title={t("liveRadio")} subtitle={t("liveRadioDesc")} />

      {nowStreaming ? (
        <View className="mb-4 flex-row items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 self-center">
          <View className="h-2 w-2 rounded-full bg-emerald-500" />
          <Text className="text-xs font-medium text-emerald-500">
            {t("nowStreaming")} {track?.title}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : error ? (
        <EmptyState title={t("noRadioStations")} icon={RadioIcon} />
      ) : data && data.length > 0 ? (
        <View className="gap-2.5">
          {data.map((station) => {
            const active = isActiveStation(station);
            const isLiked = liked.has(station.$id);
            return (
              <View
                key={station.$id}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <View className="flex-row items-center gap-3">
                  <View className="relative">
                    <Artwork
                      uri={station.logoUrl}
                      size={64}
                      rounded="rounded-2xl"
                      fallbackIcon={RadioIcon}
                    />
                    {station.isLive ? (
                      <View className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 px-2 py-0.5">
                        <Text className="text-[10px] font-bold text-white">LIVE</Text>
                      </View>
                    ) : null}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                      {station.name}
                    </Text>
                    {station.description ? (
                      <Text
                        numberOfLines={1}
                        className="mt-0.5 text-xs text-slate-500 dark:text-slate-400"
                      >
                        {station.description}
                      </Text>
                    ) : null}
                    <View className="mt-2">
                      <View
                        className={
                          station.isLive
                            ? "self-start rounded-full bg-red-500/10 px-2 py-0.5"
                            : "self-start rounded-full bg-slate-800/50 px-2 py-0.5"
                        }
                      >
                        <Text
                          className={
                            station.isLive
                              ? "text-[11px] font-medium text-red-500"
                              : "text-[11px] font-medium text-slate-400"
                          }
                        >
                          {station.isLive ? t("liveStream") : t("recorded")}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => toggleLike(station.$id)}
                      accessibilityLabel={t("liked")}
                      className={
                        isLiked
                          ? "rounded-xl bg-rose-500/20 p-2.5 active:opacity-70"
                          : "rounded-xl bg-slate-800/20 p-2.5 active:opacity-70 dark:bg-slate-800/50"
                      }
                    >
                      <Heart
                        size={18}
                        color={isLiked ? "#fb7185" : "#94a3b8"}
                        fill={isLiked ? "#fb7185" : "none"}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => handlePress(station)}
                      className="h-14 w-14 items-center justify-center rounded-2xl bg-primary active:opacity-90"
                    >
                      {active && isPlaying ? (
                        <Pause size={22} color="#0f172a" />
                      ) : (
                        <Play size={22} color="#0f172a" />
                      )}
                    </Pressable>
                  </View>
                </View>
                {active ? (
                  <View className="mt-3 flex-row items-center gap-1.5 self-start rounded-full bg-primary px-2.5 py-1">
                    {isPlaying ? <Signal size={12} color="#0f172a" /> : null}
                    <Text className="text-[11px] font-bold text-slate-900">
                      {t("liveStream")}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState title={t("noRadioStations")} icon={RadioIcon} />
      )}

      {showVolumeBar && setVolume ? (
        <View className="mt-4 rounded-2xl border border-primary/20 bg-white p-4 dark:border-primary/20 dark:bg-slate-800/40">
          <View className="flex-row items-center gap-3">
            {canToggleMute && toggleMute ? (
              <Pressable
                onPress={() => toggleMute()}
                className="rounded-xl bg-slate-800/20 p-2 active:opacity-70 dark:bg-slate-800"
              >
                {isMuted ? (
                  <VolumeX size={20} color="#94a3b8" />
                ) : (
                  <Volume2 size={20} color="#94a3b8" />
                )}
              </Pressable>
            ) : null}
            <View
              className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700/50"
              onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
              onTouchEnd={(e) => {
                if (trackWidth > 0 && setVolume) {
                  const v = Math.min(
                    1,
                    Math.max(0, e.nativeEvent.locationX / trackWidth),
                  );
                  setVolume(v);
                  if (v > 0 && isMuted && toggleMute) toggleMute();
                }
              }}
            >
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
              />
            </View>
            <Text className="w-12 text-right font-mono text-xs text-slate-400">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </Text>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
