import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { BarChart3 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/hooks/useTranslation";
import { getRecentHistory } from "@/lib/db";
import { formatDuration } from "@/lib/utils";
import type { PlaybackHistory } from "@/types";

interface Stats {
  totalSeconds: number;
  episodesPlayed: number;
  topSpeaker: string | null;
  activeDays: number;
  longestStreak: number;
}

function computeStats(all: PlaybackHistory[]): Stats {
  let totalSeconds = 0;
  let episodesPlayed = 0;
  const speakerCounts: Record<string, number> = {};
  const days = new Set<string>();

  for (const h of all) {
    const secs = h.duration > 0 ? (h.completed ? h.duration : h.position) : h.position;
    totalSeconds += secs;
    episodesPlayed += 1;
    if (h.speaker) speakerCounts[h.speaker] = (speakerCounts[h.speaker] ?? 0) + 1;
    const iso = new Date(h.playedAt).toISOString().slice(0, 10);
    days.add(iso);
  }

  let topSpeaker: string | null = null;
  let topCount = 0;
  for (const [speaker, count] of Object.entries(speakerCounts)) {
    if (count > topCount) {
      topCount = count;
      topSpeaker = speaker;
    }
  }

  return {
    totalSeconds,
    episodesPlayed,
    topSpeaker,
    activeDays: days.size,
    longestStreak: computeStreak([...days]),
  };
}

function computeStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 0) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(sorted[i - 1] + "T00:00:00Z");
    const cur = new Date(sorted[i] + "T00:00:00Z");
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

export default function StatsScreen() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getRecentHistory(5000).then((all) => {
        setSummary(computeStats(all as unknown as PlaybackHistory[]));
        setLoaded(true);
      });
    }, []),
  );

  const hasData = summary !== null && summary.episodesPlayed > 0;

  return (
    <Screen>
      <BackHeader title={t("listeningStats")} />

      {!loaded ? null : !hasData ? (
        <EmptyState
          title={t("noStatsYet")}
          description={t("playEpisodesToSeeStats")}
          icon={BarChart3}
        />
      ) : (
        <View className="gap-3">
          <StatCard label={t("totalListeningTime")} value={formatDuration(summary!.totalSeconds)} accent />
          <View className="flex-row gap-3">
            <StatCard label={t("episodesPlayed")} value={String(summary!.episodesPlayed)} />
            <StatCard label={t("activeDays")} value={String(summary!.activeDays)} />
          </View>
          <View className="flex-row gap-3">
            <StatCard label={t("longestStreak")} value={`${summary!.longestStreak} ${t("daysUnit")}`} />
            <StatCard
              label={t("topSpeaker")}
              value={summary!.topSpeaker ?? "—"}
              small
            />
          </View>
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