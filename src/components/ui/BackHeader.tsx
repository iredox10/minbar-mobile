import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

interface BackHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function BackHeader({ title, subtitle, right }: BackHeaderProps) {
  const router = useRouter();

  return (
    <View className="mb-4 mt-1 flex-row items-center gap-3">
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        hitSlop={12}
        className="h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800/40"
      >
        <ArrowLeft size={20} color="#94a3b8" />
      </Pressable>
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-lg font-bold text-slate-900 dark:text-white"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-xs text-slate-500 dark:text-slate-400">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}