# Arewa Central — Mobile (minbar-mobile)

React Native (Expo) port of the [Arewa Central / Muslim Central PWA](../minbar)
web app. Same Appwrite backend — the app is a sibling of the web project and
shares its collections.

## Stack

- **Expo SDK 57** (Expo Router file-based navigation, typed routes)
- **NativeWind v4** + Tailwind (reuses the web app's slate + `#d4a853` primary tokens)
- **Appwrite** (same backend as the web PWA) — Phase 1 wires content
- **track-player (@rntp/player)** — native audio engine (Phase 2)

## Native playback

- Requires a dev build (`bunx expo run:android` / `bunx expo run:ios`).
  Expo Go does not support background playback, notification/lock-screen
  controls, or the background service.
- Notification / lock-screen / headset controls: play/pause, next/prev, seek.
- Runs as a background service, so audio keeps playing outside the app and
  can be controlled from the notification, lock screen, or headset buttons.

## Getting started

```bash
npm install
npx expo start
```

Env: copy `.env.example` → `.env` and fill `EXPO_PUBLIC_APPWRITE_PROJECT_ID`
(public client-side value — safe to ship).

## Project layout

```
app/            expo-router routes (tabs + player stacked)
src/
  components/   shared UI (Screen, SectionHeader, EmptyState)
  context/      SettingsContext (theme + language, persisted)
  hooks/        useTranslation, useSettings
  lib/          i18n (en/ha), utils
  theme/        palette (port of web tokens)
```

## Phases

1. **Phase 0 (done)** — Expo + NativeWind skeleton, tab bar, theme/language, placeholder screens
2. **Phase 1** — Appwrite client + content browsing (Home/Series/Speakers/Episodes) + local DB
3. **Phase 2** — track-player (@rntp/player) engine, player screen, mini player
4. **Phase 3** — downloads, history, favorites, playlists, bookmarks, sharing
5. **Phase 4** — polish / dark-mode QA / store config

Admin dashboard stays on the web PWA.