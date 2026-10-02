import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BookOpen, Heart, Pause, Play, Search, X } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { usePlayer } from "@/context/PlayerContext";
import { getAllDuas } from "@/lib/appwrite";
import { addFavorite, getFavorites, removeFavorite } from "@/lib/db";
import { trackDuaView, trackFavoriteAdd } from "@/lib/analytics";
import type { Dua, DuaCategory } from "@/types";
import type { TranslationKey } from "@/lib/i18n";

const CATEGORIES: {
  id: DuaCategory | "all";
  labelKey: TranslationKey;
  icon: string;
  gradient: string;
}[] = [
  {
    id: "all",
    labelKey: "categoryAll",
    icon: "🗂️",
    gradient: "from-slate-500/20 to-gray-500/20",
  },
  {
    id: "morning",
    labelKey: "categoryMorning",
    icon: "🌅",
    gradient: "from-yellow-500/20 to-amber-500/20",
  },
  {
    id: "evening",
    labelKey: "categoryEvening",
    icon: "🌙",
    gradient: "from-indigo-500/20 to-purple-500/20",
  },
  {
    id: "sleep",
    labelKey: "categorySleep",
    icon: "💫",
    gradient: "from-violet-500/20 to-purple-500/20",
  },
  {
    id: "travel",
    labelKey: "categoryTravel",
    icon: "✈️",
    gradient: "from-sky-500/20 to-blue-500/20",
  },
  {
    id: "eating",
    labelKey: "categoryEating",
    icon: "🍽️",
    gradient: "from-rose-500/20 to-pink-500/20",
  },
  {
    id: "prophetic",
    labelKey: "categoryProphetic",
    icon: "📖",
    gradient: "from-amber-500/20 to-orange-500/20",
  },
  {
    id: "quranic",
    labelKey: "categoryQuranic",
    icon: "📿",
    gradient: "from-emerald-500/20 to-teal-500/20",
  },
  {
    id: "general",
    labelKey: "categoryGeneral",
    icon: "🤲",
    gradient: "from-slate-500/20 to-gray-500/20",
  },
];

export default function DuasScreen() {
  const { t } = useTranslation();
  const { focus } = useLocalSearchParams<{ focus?: string | string[] }>();
  const focusId = Array.isArray(focus) ? focus[0] : focus;
  const { track, isPlaying, playTrackImmediately } = usePlayer();

  const [category, setCategory] = useState<DuaCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const scrollRef = useRef<ScrollView>(null);
  const itemRefs = useRef(new Map<string, View>());
  const focusHandled = useRef<string | null>(null);

  const { data, loading, error } = useAsyncData(getAllDuas, []);

  useEffect(() => {
    let active = true;
    getFavorites("dua")
      .then((favs) => {
        if (active) setFavorites(new Set(favs.map((f) => f.itemId)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = searchQuery.trim().toLowerCase();
    const result = data.filter((d) => {
      if (category !== "all" && d.category !== category) return false;
      if (!query) return true;
      return (
        d.title.toLowerCase().includes(query) ||
        d.arabic.includes(searchQuery.trim()) ||
        d.translation.toLowerCase().includes(query)
      );
    });
    return [...result].sort((a, b) => {
      const aOrder =
        typeof (a as { sortOrder?: unknown }).sortOrder === "number"
          ? (a.sortOrder as number)
          : Number.MAX_SAFE_INTEGER;
      const bOrder =
        typeof (b as { sortOrder?: unknown }).sortOrder === "number"
          ? (b.sortOrder as number)
          : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.title.localeCompare(b.title);
    });
  }, [data, category, searchQuery]);

  // Deep link from favorites: ?focus=<duaId> expands + scrolls to the dua.
  useEffect(() => {
    if (!focusId || !data || focusHandled.current === focusId) return;
    const target = data.find((d) => d.$id === focusId);
    if (!target) return;
    focusHandled.current = focusId;
    setCategory("all");
    setSearchQuery("");
    setExpanded((prev) => new Set(prev).add(focusId));
    trackDuaView(target.$id, target.title);
    const timer = setTimeout(() => {
      try {
        const node = itemRefs.current.get(focusId);
        const scroller = scrollRef.current;
        if (node && scroller) {
          node.measureLayout(
            scroller as unknown as number,
            (_x, y) => {
              scroller.scrollTo({ y: Math.max(0, y - 12), animated: true });
            },
            () => {},
          );
        }
      } catch {
        // Scroll is best-effort; the dua is still expanded above.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [focusId, data]);

  const toggle = (dua: Dua) => {
    const isExpanded = expanded.has(dua.$id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dua.$id)) {
        next.delete(dua.$id);
      } else {
        next.add(dua.$id);
      }
      return next;
    });
    if (!isExpanded) trackDuaView(dua.$id, dua.title);
  };

  const toggleFavorite = async (dua: Dua) => {
    if (favorites.has(dua.$id)) {
      await removeFavorite("dua", dua.$id);
      setFavorites((prev) => {
        const next = new Set(prev);
        next.delete(dua.$id);
        return next;
      });
    } else {
      await addFavorite({
        type: "dua",
        itemId: dua.$id,
        title: dua.title,
        addedAt: new Date(),
      });
      trackFavoriteAdd(dua.$id, "dua", dua.title);
      setFavorites((prev) => new Set(prev).add(dua.$id));
    }
  };

  const handlePlay = (dua: Dua) => {
    if (!dua.audioUrl) return;
    playTrackImmediately({
      id: dua.$id,
      title: dua.title,
      audioUrl: dua.audioUrl,
      duration: 0,
      type: "dua",
    }).catch(() => {});
  };

  return (
    <Screen scroll={false}>
      <View className="flex-1 px-4 pt-4">
        <BackHeader title={t("duas")} subtitle={t("duasDesc")} />

        <View className="mb-3 flex-row items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-800/40">
          <Search size={18} color="#94a3b8" />
          <TextInput
            className="flex-1 py-3 text-[15px] text-slate-900 dark:text-slate-100"
            placeholder={t("searchDuas")}
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <X size={18} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3 -mx-4 px-4"
          contentContainerClassName="gap-2"
        >
          {CATEGORIES.map((cat) => {
            const selected = cat.id === category;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setCategory(cat.id)}
                className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 ${
                  selected
                    ? "bg-primary"
                    : `border border-slate-300 bg-gradient-to-r ${cat.gradient} dark:border-slate-700`
                }`}
              >
                <Text className="text-sm">{cat.icon}</Text>
                <Text
                  className={`text-sm ${
                    selected ? "font-semibold text-slate-900" : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {t(cat.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          ref={scrollRef}
          className="flex-1 -mx-4 px-4"
          contentContainerClassName="gap-2.5 pb-24"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color="#d4a853" />
            </View>
          ) : error ? (
            <EmptyState title={t("noDuasFound")} icon={BookOpen} />
          ) : filtered.length === 0 ? (
            <EmptyState title={t("noDuasFound")} icon={BookOpen} />
          ) : (
            filtered.map((dua) => (
              <DuaCard
                key={dua.$id}
                dua={dua}
                expanded={expanded.has(dua.$id)}
                isFavorite={favorites.has(dua.$id)}
                playing={track?.id === dua.$id && isPlaying}
                onToggle={() => toggle(dua)}
                onToggleFavorite={() => toggleFavorite(dua)}
                onPlay={() => handlePlay(dua)}
                registerRef={(node) => {
                  if (node) itemRefs.current.set(dua.$id, node);
                  else itemRefs.current.delete(dua.$id);
                }}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

function DuaCard({
  dua,
  expanded,
  isFavorite,
  playing,
  onToggle,
  onToggleFavorite,
  onPlay,
  registerRef,
}: {
  dua: Dua;
  expanded: boolean;
  isFavorite: boolean;
  playing: boolean;
  onToggle: () => void;
  onToggleFavorite: () => void;
  onPlay: () => void;
  registerRef: (node: View | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <View ref={registerRef} collapsable={false}>
      <Pressable
        onPress={onToggle}
        className={`rounded-2xl border bg-white p-4 active:opacity-90 dark:bg-slate-800/40 ${
          playing
            ? "border-primary dark:border-primary"
            : "border-slate-200 dark:border-slate-800"
        }`}
      >
        <View className="mb-2 flex-row items-start justify-between gap-2">
          <Text className="flex-1 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            {dua.title}
          </Text>
          <View className="flex-row items-center gap-2">
            {dua.audioUrl ? (
              <Pressable
                onPress={onPlay}
                hitSlop={8}
                className={`h-9 w-9 items-center justify-center rounded-xl ${
                  playing ? "bg-primary" : "bg-slate-100 dark:bg-slate-700/60"
                }`}
              >
                {playing ? (
                  <Pause size={16} color="#0f172a" fill="#0f172a" />
                ) : (
                  <Play size={16} color="#d4a853" fill="#d4a853" />
                )}
              </Pressable>
            ) : null}
            <Pressable onPress={onToggleFavorite} hitSlop={8} className="p-1.5">
              <Heart
                size={18}
                color={isFavorite ? "#f87171" : "#94a3b8"}
                fill={isFavorite ? "#f87171" : "transparent"}
              />
            </Pressable>
          </View>
        </View>
        <Text className="font-arabic text-right text-xl leading-relaxed text-slate-900 dark:text-slate-100">
          {dua.arabic}
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
    </View>
  );
}
