import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useTranslation } from "@/hooks/useTranslation";

interface SectionHeaderProps {
  title: string;
  action?: string | null;
  onPress?: () => void;
  rightSlot?: ReactNode;
  /** Color of the leading accent bar, e.g. "#a78bfa" (web uses a colored bar per section). */
  accent?: string;
}

export function SectionHeader({ title, action, onPress, rightSlot, accent }: SectionHeaderProps) {
  const { t } = useTranslation();

  return (
    <View className="mb-5 flex-row items-center justify-between px-1">
      <View className="flex-row items-center gap-2">
        {accent ? (
          <View
            className="h-6 w-1 rounded-full"
            style={{ backgroundColor: accent }}
          />
        ) : null}
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</Text>
      </View>
      {rightSlot ?? (
        onPress ? (
          <Pressable onPress={onPress} hitSlop={8}>
            <View className="flex-row items-center gap-1">
              <Text className="text-sm font-medium text-primary">
                {action ?? t("viewAll")}
              </Text>
              <ChevronRight size={16} color="#d4a853" />
            </View>
          </Pressable>
        ) : null
      )}
    </View>
  );
}