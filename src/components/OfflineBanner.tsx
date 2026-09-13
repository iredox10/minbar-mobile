import { View, Text } from "react-native";
import { WifiOff } from "lucide-react-native";
import { useNetInfo } from "@react-native-community/netinfo";

/**
 * Thin banner shown when the device has no connectivity.
 * Rendered at the top of the root layout, above the navigator.
 */
export function OfflineBanner() {
  const netInfo = useNetInfo();

  // `isConnected` is `null` until NetInfo resolves — hide until we know.
  if (netInfo.isConnected !== false) return null;

  return (
    <View className="flex-row items-center justify-center gap-2 bg-amber-500 px-4 py-2">
      <WifiOff size={14} color="#0f172a" />
      <Text className="text-xs font-semibold text-slate-900">
        You&apos;re offline
      </Text>
    </View>
  );
}
