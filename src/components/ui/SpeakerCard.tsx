import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { Mic } from "lucide-react-native";

import { Artwork } from "@/components/Artwork";
import { useTranslation } from "@/hooks/useTranslation";
import type { Speaker } from "@/types";

interface SpeakerCardProps {
  speaker: Speaker;
}

export function SpeakerCard({ speaker }: SpeakerCardProps) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/speakers/[slug]", params: { slug: speaker.slug } })
      }
      className="w-32 active:opacity-80"
    >
      <Artwork uri={speaker.imageUrl} size={128} rounded="rounded-2xl" fallbackIcon={Mic} />
      <Text
        numberOfLines={1}
        className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
      >
        {speaker.name}
      </Text>
      <Text className="text-xs text-slate-400 dark:text-slate-500">
        {speaker.featured ? t("featured") : t("speakers")}
      </Text>
    </Pressable>
  );
}