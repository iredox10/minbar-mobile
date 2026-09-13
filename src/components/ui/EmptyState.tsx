import type { ComponentType } from "react";
import { Text, View } from "react-native";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
}

export function EmptyState({ title, description, icon: Icon }: EmptyStateProps) {
  return (
    <View className="items-center justify-center rounded-2xl border border-slate-200 bg-white py-10 px-6 dark:border-slate-800 dark:bg-slate-800/30">
      {Icon && (
        <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Icon size={22} color="#d4a853" />
        </View>
      )}
      <Text className="text-center text-[15px] font-semibold text-slate-700 dark:text-slate-200">
        {title}
      </Text>
      {description ? (
        <Text className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
          {description}
        </Text>
      ) : null}
    </View>
  );
}