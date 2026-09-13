import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { account } from "@/lib/appwrite";
import { Screen } from "@/components/Screen";

/**
 * OAuth landing route: `arewa://auth-callback?userId=…&secret=…`.
 *
 * Exchanges the one-time `userId` + `secret` pair for an Appwrite session,
 * then redirects into the tab navigator. (The `UserProvider` also completes
 * the session from its own Linking listener; this screen covers the case
 * where the OS cold-starts the app directly on this route.)
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { userId, secret } = useLocalSearchParams<{
    userId?: string;
    secret?: string;
  }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (typeof userId !== "string" || typeof secret !== "string") {
      setError("Missing sign-in credentials. Please try again.");
      return;
    }

    account
      .createSession({ userId, secret })
      .then(() => {
        if (active) router.replace("/(tabs)");
      })
      .catch((e) => {
        console.error("Auth callback session creation failed:", e);
        if (active) setError("Sign-in failed. Please try again.");
      });

    return () => {
      active = false;
    };
  }, [userId, secret, router]);

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-4 py-16">
        {error ? (
          <>
            <Text className="text-center text-sm text-red-500">{error}</Text>
            <Pressable
              onPress={() => router.replace("/(tabs)")}
              className="rounded-2xl bg-primary px-5 py-3 active:opacity-90"
            >
              <Text className="text-sm font-semibold text-slate-900">
                Back to home
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color="#d4a853" />
            <Text className="text-sm text-slate-400">Signing you in…</Text>
          </>
        )}
      </View>
    </Screen>
  );
}
