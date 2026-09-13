import "expo-router/entry";
import { registerTrackPlayerService } from "./src/audio/playback-service";

// Register the @rntp/player Android headless-JS handler at the entry point so
// media keys / notification actions work when the app was killed (headless JS
// spins up this bundle). Re-exporting expo-router/entry above keeps typed
// routes and all Expo Router behavior unchanged.
registerTrackPlayerService();
