import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Radio as RadioIcon, Signal } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { usePlayer } from "@/context/PlayerContext";
import { getRadioStations } from "@/lib/appwrite";
import { trackRadioStart } from "@/lib/analytics";
import type { RadioStation } from "@/types";

export default function RadioScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { track, isPlaying, playTrackImmediately, togglePlay } = usePlayer();
  const { data, loading, error } = useAsyncData(getRadioStations, []);

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

  return (
    <Screen>
      <BackHeader title={t("liveRadio")} subtitle={t("liveRadioDesc")} />

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
            return (
              <Pressable
                key={station.$id}
                onPress={() => handlePress(station)}
                className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                  <RadioIcon size={20} color={active ? "#b8943f" : "#d4a853"} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                    {station.name}
                  </Text>
                  {station.description ? (
                    <Text numberOfLines={1} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {station.description}
                    </Text>
                  ) : null}
                </View>
                {active ? (
                  <View className="flex-row items-center gap-1.5 rounded-full bg-primary px-2.5 py-1">
                    {isPlaying ? (
                      <Signal size={12} color="#0f172a" />
                    ) : null}
                    <Text className="text-[11px] font-bold text-slate-900">{t("liveStream")}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <EmptyState title={t("noRadioStations")} icon={RadioIcon} />
      )}
    </Screen>
  );
}