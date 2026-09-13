import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { BookOpen } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getAllDuas } from "@/lib/appwrite";
import { trackDuaView } from "@/lib/analytics";
import type { Dua, DuaCategory } from "@/types";

const CATEGORY_ORDER: (DuaCategory | "all")[] = [
  "all",
  "morning",
  "evening",
  "sleep",
  "travel",
  "eating",
  "prophetic",
  "quranic",
  "general",
];

export default function DuasScreen() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<DuaCategory | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, loading, error } = useAsyncData(getAllDuas, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return category === "all" ? data : data.filter((d) => d.category === category);
  }, [data, category]);

  const categoryLabel = (c: DuaCategory | "all") => {
    switch (c) {
      case "all":
        return t("categoryAll");
      case "prophetic":
        return t("categoryProphetic");
      case "quranic":
        return t("categoryQuranic");
      case "morning":
        return t("categoryMorning");
      case "evening":
        return t("categoryEvening");
      case "sleep":
        return t("categorySleep");
      case "travel":
        return t("categoryTravel");
      case "eating":
        return t("categoryEating");
      default:
        return t("categoryGeneral");
    }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Screen>
      <BackHeader title={t("duas")} subtitle={t("duasDesc")} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-4 -mx-4 px-4"
        contentContainerClassName="gap-2"
      >
        {CATEGORY_ORDER.map((c) => {
          const selected = c === category;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              className={`rounded-full px-4 py-2 ${selected ? "bg-primary" : "border border-slate-300 dark:border-slate-700"}`}
            >
              <Text className={`text-sm ${selected ? "font-semibold text-slate-900" : "text-slate-600 dark:text-slate-300"}`}>
                {categoryLabel(c)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : error ? (
        <EmptyState title={t("noDuasFound")} icon={BookOpen} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t("noDuasFound")} icon={BookOpen} />
      ) : (
        <View className="gap-2.5 pb-4">
          {filtered.map((dua) => (
            <DuaCard key={dua.$id} dua={dua} expanded={expanded.has(dua.$id)} onToggle={() => toggle(dua.$id)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function DuaCard({
  dua,
  expanded,
  onToggle,
}: {
  dua: Dua;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() => {
        if (!expanded) trackDuaView(dua.$id, dua.title);
        onToggle();
      }}
      className="rounded-2xl border border-slate-200 bg-white p-4 active:opacity-90 dark:border-slate-800 dark:bg-slate-800/40"
    >
      <Text className="font-arabic text-right text-xl leading-relaxed text-slate-900 dark:text-slate-100">
        {dua.arabic}
      </Text>
      <Text className="mt-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
        {dua.title}
      </Text>
      {expanded ? (
        <View className="mt-3">
          {dua.transliteration ? (
            <Text className="text-sm italic text-slate-500 dark:text-slate-400">
              {dua.transliteration}
            </Text>
          ) : null}
          <Text className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {dua.translation}
          </Text>
          <Text className="mt-3 text-xs text-slate-400">{dua.reference}</Text>
          <Text className="mt-1 text-xs text-primary">{t("propheticQuranic")}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}