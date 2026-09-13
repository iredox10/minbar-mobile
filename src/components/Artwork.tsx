import type { ComponentType, ReactNode } from "react";
import { Image, View } from "react-native";
import { Music } from "lucide-react-native";

import { cn } from "@/lib/utils";

interface ArtworkProps {
  uri?: string;
  size?: number;
  rounded?: string;
  className?: string;
  fallbackIcon?: ComponentType<{ size: number; color: string }>;
  children?: ReactNode;
}

export function Artwork({
  uri,
  size = 64,
  rounded = "rounded-xl",
  className,
  fallbackIcon: FallbackIcon = Music,
  children,
}: ArtworkProps) {
  return (
    <View
      style={{ width: size, height: size }}
      className={cn(
        "items-center justify-center overflow-hidden bg-slate-800/40",
        rounded,
        className,
      )}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <FallbackIcon size={Math.round(size * 0.4)} color="#64748b" />
      )}
      {children}
    </View>
  );
}