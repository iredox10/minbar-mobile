import { requestNotificationPermissionsAsync, setAudioModeAsync } from "expo-audio";

export async function setupPlayer(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
  });
  try {
    await requestNotificationPermissionsAsync();
  } catch {
    // Permission prompt may be unavailable on some platforms; playback still works.
  }
}
