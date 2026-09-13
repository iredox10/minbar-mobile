import { useCallback, useMemo, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { BarChart3, Share2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/hooks/useTranslation";
import { getRecentHistory } from "@/lib/db";
import { formatDuration } from "@/lib/utils";
import type { PlaybackHistory } from "@/types";

type Period = "week" | "month" | "all";

interface DayDatum {
  label: string;
  minutes: number;
}

interface SpeakerDatum {
  name: string;
  count: number;
  minutes: number;
}

function listenedMinutes(h: PlaybackHistory): number {
  const position = Math.max(0, h.position ?? 0);
  const duration = h.duration ?? 0;
  const secs = duration > 0 ? Math.min(position, duration) : position;
  return secs / 60;
}

function toTime(ts: Date | string | number): number {
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : 0;
}

export default function StatsScreen() {
  const { t } = useTranslation();
  const [history, setHistory] = useState<PlaybackHistory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState<Period>("week");

  useFocusEffect(
    useCallback(() => {
      getRecentHistory(5000).then((all) => {
        setHistory((all as unknown as PlaybackHistory[]) ?? []);
        setLoaded(true);
      });
    }, []),
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    let filtered = history;
    if (period === "week") {
      filtered = history.filter((h) => now - toTime(h.playedAt) < weekMs);
    } else if (period === "month") {
      filtered = history.filter((h) => now - toTime(h.playedAt) < monthMs);
    }

    const totalMinutes = Math.round(
      filtered.reduce((acc, h) => acc + listenedMinutes(h), 0),
    );
    const totalSeconds = totalMinutes * 60;
    const completedCount = filtered.filter((h) => h.completed).length;
    const uniqueEpisodes = new Set(filtered.map((h) => h.episodeId)).size;

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekData: DayDatum[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const dayStart = new Date(now - i * 24 * 60 * 60 * 1000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;
      const dayMinutes = filtered
        .filter((h) => {
          const playedAt = toTime(h.playedAt);
          return playedAt >= dayStart.getTime() && playedAt < dayEnd;
        })
        .reduce((acc, h) => acc + listenedMinutes(h), 0);
      weekData.push({
        label: dayNames[dayStart.getDay()],
        minutes: Math.round(dayMinutes),
      });
    }

    const speakerMap = new Map<string, SpeakerDatum>();
    for (const h of filtered) {
      const name = h.speaker || "Unknown";
      const existing = speakerMap.get(name) ?? { name, count: 0, minutes: 0 };
      existing.count += 1;
      existing.minutes += listenedMinutes(h);
      speakerMap.set(name, existing);
    }
    const topSpeakers = [...speakerMap.values()]
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    return {
      totalMinutes,
      totalSeconds,
      completedCount,
      uniqueEpisodes,
      totalSessions: filtered.length,
      weekData,
      topSpeakers,
    };
  }, [history, period]);

  const maxWeekMinutes = Math.max(...stats.weekData.map((d) => d.minutes), 1);
  const maxSpeakerMinutes = Math.max(
    ...stats.topSpeakers.map((s) => s.minutes),
    1,
  );

  const handleShare = useCallback(async () => {
    const summary =
      stats.totalMinutes >= 60
        ? `${Math.floor(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m`
        : `${stats.totalMinutes}m`;
    try {
      await Share.share({
        message: `I've listened for ${summary} across ${stats.uniqueEpisodes} episodes on Arewa Central.`,
      });
    } catch {
      // User dismissed the share sheet — no-op.
    }
  }, [stats.totalMinutes, stats.uniqueEpisodes]);

  const hasData = loaded && history.length > 0 && stats.totalSessions > 0;
  const periods: Period[] = ["week", "month", "all"];
  const periodLabel = (p: Period) =>
    p === "week" ? "Week" : p === "month" ? "Month" : "All";

  return (
    <Screen>
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-1">
          <BackHeader title={t("listeningStats")} />
        </View>
        <Pressable
          onPress={handleShare}
          accessibilityLabel={t("share")}
          className="rounded-xl bg-slate-800/20 p-2.5 active:opacity-70 dark:bg-slate-800"
        >
          <Share2 size={18} color="#d4a853" />
        </Pressable>
      </View>

      <View className="mb-4 flex-row gap-2">
        {periods.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            className={
              period === p
                ? "rounded-full bg-primary px-4 py-2 active:opacity-90"
                : "rounded-full bg-slate-800/20 px-4 py-2 active:opacity-70 dark:bg-slate-800/50"
            }
          >
            <Text
              className={
                period === p
                  ? "text-sm font-medium capitalize text-slate-900"
                  : "text-sm font-medium capitalize text-slate-400"
              }
            >
              {periodLabel(p)}
            </Text>
          </Pressable>
        ))}
      </View>

      {!loaded ? null : !hasData ? (
        <EmptyState
          title={t("noStatsYet")}
          description={t("playEpisodesToSeeStats")}
          icon={BarChart3}
        />
      ) : (
        <View className="gap-3">
          <StatCard
            label={t("totalListeningTime")}
            value={formatDuration(stats.totalSeconds)}
            accent
          />
          <View className="flex-row gap-3">
            <StatCard label={t("episodesPlayed")} value={String(stats.uniqueEpisodes)} />
            <StatCard label={t("activeDays")} value={String(stats.totalSessions)} />
          </View>

          <View className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/40">
            <Text className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
              Daily Activity
            </Text>
            <View className="flex-row items-end justify-between gap-2">
              {stats.weekData.map((day) => (
                <View key={`${day.label}-${day.minutes}`} className="flex-1 items-center gap-1">
                  <Text className="text-[10px] text-slate-400">
                    {day.minutes > 0 ? `${day.minutes}m` : ""}
                  </Text>
                  <View
                    className="w-full justify-end overflow-hidden rounded-t-lg bg-slate-700/30"
                    style={{ height: 100 }}
                  >
                    <View
                      className="w-full rounded-t-lg bg-primary"
                      style={{
                        height: `${Math.max(
                          day.minutes > 0 ? 6 : 0,
                          (day.minutes / maxWeekMinutes) * 100,
                        )}%`,
                      }}
                    />
                  </View>
                  <Text className="text-[10px] text-slate-500">{day.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {stats.topSpeakers.length > 0 ? (
            <View className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/40">
              <Text className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
                Top Speakers
              </Text>
              <View className="gap-3">
                {stats.topSpeakers.map((speaker, i) => (
                  <View key={speaker.name} className="flex-row items-center gap-3">
                    <Text className="w-6 text-sm font-bold text-slate-500">
                      #{i + 1}
                    </Text>
                    <View className="flex-1 min-w-0">
                      <Text
                        numberOfLines={1}
                        className="text-sm font-medium text-slate-800 dark:text-slate-200"
                      >
                        {speaker.name}
                      </Text>
                      <View className="mt-1 flex-row items-center gap-2">
                        <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/30">
                          <View
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${(speaker.minutes / maxSpeakerMinutes) * 100}%`,
                            }}
                          />
                        </View>
                        <Text className="text-[10px] text-slate-500">
                          {Math.round(speaker.minutes)}m
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function StatCard({
  label,
  value,
  accent = false,
  small = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <View
      className={
        accent
          ? "flex-1 rounded-2xl bg-primary p-4"
          : "flex-1 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40"
      }
    >
      <Text
        className={
          accent ? "text-xs font-medium text-slate-800" : "text-xs font-medium text-slate-500 dark:text-slate-400"
        }
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className={`mt-1 font-bold ${accent ? "text-xl text-slate-900" : small ? "text-base text-slate-900 dark:text-white" : "text-xl text-slate-900 dark:text-white"}`}
      >
        {value}
      </Text>
    </View>
  );
}
