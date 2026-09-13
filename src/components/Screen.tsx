import type { ReactNode } from "react";
import { ScrollView, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";

interface ScreenProps {
  children: ReactNode;
  className?: string;
  contentContainerClassName?: string;
  scroll?: boolean;
  style?: ViewStyle;
}

/** Themed screen container used by all tab/stack screens. */
export function Screen({
  children,
  className,
  contentContainerClassName,
  scroll = true,
  style,
}: ScreenProps) {
  const wrapper =
    "flex-1 bg-slate-100 dark:bg-slate-900";

  if (!scroll) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} className={cn(wrapper, className)} style={style}>
        <View className="flex-1">{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} className={cn(wrapper, className)} style={style}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 96 }}
        contentContainerClassName={cn("px-4 pt-4", contentContainerClassName)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}