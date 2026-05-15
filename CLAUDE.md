# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Wavio is a React Native / Expo music streaming client for Android (iOS WIP) that talks to multiple server types: [OpenSubsonic](https://opensubsonic.netlify.app/docs/) / Navidrome (Subsonic API) and Jellyfin. Podcast features use the Taddy API.

## Commands

Package manager is **bun** (see `bun.lock`), though README still references pnpm. Use `bun install` / `bun run <script>`.

- `bun run android` / `bun run ios` / `bun run web` — run dev client (sets `DARK_MODE=media`)
- `bun run start` — `expo start`
- `bun run prebuild` — regenerate `android/` and `ios/` native projects
- `bun run lint` / `bun run lint:fix` — Biome check (formatter + linter, replaces ESLint/Prettier)
- `bun run test` — `jest --watchAll` (preset `jest-expo`). Single test: `bunx jest __tests__/queue.store.test.ts`
- `bun run doctor` — `expo-doctor`
- `eas build --profile preview --platform android` — APK build (profiles in `eas.json`)

`.env` holds `EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION` and `EXPO_PUBLIC_NAVIDROME_CLIENT`, which are injected into every Subsonic request.

TS path alias: `@/*` → repo root.

Don't execute prebuild and building yourself. Inform the user to do so.

## Architecture

### Routing (expo-router, file-based)

`app/` uses route groups:
- `app/(auth)/login.tsx` — unauthenticated flow
- `app/(app)/(tabs)/(home|library|search)/` — three stacked tab groups, each owns its own nested stack (albums, artists, playlists, etc.). Duplicated screens like `settings.tsx` / `servers.tsx` across tab groups are intentional so back-stack stays within the active tab.
- `app/(app)/player.tsx`, `app/(app)/playlists/`, `app/(app)/internet-radio-stations/` — modal / full-screen routes outside the tab bar
- Root `app/_layout.tsx` wires all providers: `QueryClientProvider`, `KeyboardProvider`, `GluestackUIProvider`, `ThemeProvider`, `GestureHandlerRootView`, `BottomSheetModalProvider`, plus online/focus managers (NetInfo → react-query `onlineManager`, AppState → `focusManager`) and i18n/zod locale bootstrapping.

### Server backends (multi-protocol)

Three server types are supported, tracked by `ServerType` in `stores/servers.ts`: `navidrome`, `opensubsonic`, `jellyfin`. The active server's type is mirrored on `useAuthBase().serverType` (`stores/auth.ts`).

Each backend has its own service tree mirroring the same API sections:
- `services/openSubsonic/*.ts` — axios calls for Subsonic / OpenSubsonic / Navidrome. `services/openSubsonic/index.ts` exports a shared axios instance whose request interceptor injects `u`, `p`, `v`, `c`, `f=json` from `useAuthBase` and sets `baseURL` from the active server URL. Response interceptor logs out on `ERR_NETWORK`.
- `services/jellyfin/*.ts` — axios calls for Jellyfin. `services/jellyfin/index.ts` builds the `Authorization` header (Client/Device/DeviceId/Token via `getDeviceId`). `services/jellyfin/mappers.ts` adapts Jellyfin DTOs to the Subsonic envelope shape so the rest of the app can stay protocol-agnostic. `unsupported.ts` throws for endpoints Jellyfin doesn't expose.
- `services/backend/*.ts` — the unified dispatch layer. Each file (one per API section: browsing, lists, searching, playlists, mediaAnnotation, mediaRetrieval, sharing, bookmarks, users, system, mediaLibraryScanning, internetRadioStations, streaming, capabilities) re-exports functions that pick the right implementation via `dispatch(subsonicFn, jellyfinFn)` from `services/backend/dispatch.ts` (`isJellyfin()` reads `useAuthBase.getState().serverType`). Callers consume Subsonic-shaped responses regardless of backend.
- `hooks/backend/*.ts` — `@tanstack/react-query` hooks wrapping the dispatched services. **Always import from `@/services/backend` and `@/hooks/backend` in app code** — don't call `services/openSubsonic` or `services/jellyfin` directly from screens/components.

When adding an endpoint:
1. Add the Subsonic implementation in `services/openSubsonic/<section>.ts` (types in `services/openSubsonic/types.ts`).
2. Add the Jellyfin implementation in `services/jellyfin/<section>.ts` (or re-export from `unsupported.ts`), mapping the response to the Subsonic envelope shape.
3. Wire both through `services/backend/<section>.ts` using `dispatch(...)`.
4. Expose via `hooks/backend/use<Section>.ts`.

Subsonic error codes are translated via `openSubsonicErrorCodes` using `config/i18n`. Navidrome-specific (non-Subsonic) endpoints live under `hooks/navidrome/` and bypass the dispatch layer.

Podcast services (`services/taddyPodcasts`, `hooks/taddyPodcasts`) follow the same split for the Taddy GraphQL API.

### State (zustand + MMKV)

All persisted state is zustand with `react-native-mmkv` as the backing store (`config/storage.ts`). Key stores in `stores/`:
- `auth.ts` — active server credentials (`useAuthBase`, used by the axios interceptor)
- `servers.ts` — saved server list
- `app.ts` — app-wide settings (locale, theme, etc.)
- `queue.ts` — playback queue (tested in `__tests__/queue.store.test.ts`)
- `playlists.ts`, `podcasts.ts`, `recentPlays.ts`, `recentSearches.ts`, `offline.ts`

`createScopedStorage(scope)` in `config/storage.ts` namespaces storage per server+user; use `getAuthScope(url, username)` to build the scope key so switching servers doesn't bleed state.

`utils/createSelectors.ts` auto-generates typed selector hooks for a store.

### Playback

`expo-audio` is the audio engine. `services/player.ts` is the registered background service; the queue store drives it. Offline downloads go through `services/offlineDownloadService.ts` + `hooks/useOfflineDownloads.ts` using `expo-file-system`.

Realtime playback state for non-React consumers (widget, Android Auto) goes through `hooks/player/playbackSnapshot.ts`: call `getPlaybackSnapshot()` for the current state and `subscribePlaybackStatus(cb)` to observe changes.

### Android Auto / CarPlay

- `modules/car-auto/` — a local Expo Module that ships the Android Auto `MediaBrowserServiceCompat` implementation (registered as the `CarAuto` native module). The JS bridge in `services/carAuto/bridge.ts` calls `requireOptionalNativeModule("CarAuto")` and exposes `setNodes(json)` / `setNowPlaying(json)` to push the browse tree and now-playing metadata to the car head unit.
- `services/carAuto/tree.ts` builds the browse tree from `services/backend` (so both Subsonic and Jellyfin servers work in the car).
- `services/carAuto/play.ts` handles play intents originating from the car.
- `services/carAuto/carplay.ts` is the iOS counterpart, using `react-native-carplay`. `bridge.ts` is a no-op on iOS.
- Native wiring is generated by `plugins/withAndroidAuto.js` and `plugins/withCarPlay.js` during `expo prebuild` — edit those plugins rather than `android/` / `ios/` directly.

### Android home-screen widgets

- Native widgets are bundled by `plugins/withWidgets.js` (Kotlin sources injected into `android/` during prebuild). The native module is exposed to JS as `NativeModules.WavioWidget`.
- `services/widget.ts` is the JS-side controller. It subscribes to the queue store and `subscribePlaybackStatus` to push now-playing updates (`updateNowPlaying`, `setIsPlaying`) and recently played items (`updateRecent`) to the widget. Cover art dominant color is computed with `react-native-image-colors`.
- Widget is Android-only; the module is gated on `Platform.OS === "android"` and a non-null `NativeModules.WavioWidget`.

### UI

- Styling: **NativeWind v4** + Tailwind (`tailwind.config.js`, `global.css`). Component library is **Gluestack UI v3** (`components/ui/`) — prefer these primitives over raw RN components.
- Lists use `@shopify/flash-list`; `components/DraggableFlashList.tsx` adds reorder.
- Bottom sheets via `@gorhom/bottom-sheet` (provider wired at root).
- i18n: `i18next` + `react-i18next`, locales in `i18n/`, configured in `config/i18n.ts`. Zod error messages follow the selected locale (`z.config(z.locales[locale]())`).
- Icons: `lucide-react-native`.

### Testing

Jest with `jest-expo` preset. Tests live in `__tests__/` at the repo root. Current coverage is minimal (queue store only).

## Conventions

- Biome enforces double quotes, 2-space indent. Run `bun run lint:fix` before committing.
- Bun patches runs the pathces; check `patches/` before upgrading patched deps.
- Native directories `android/` and `ios/` are generated by `expo prebuild` but currently committed — edits there can be overwritten by prebuild.
