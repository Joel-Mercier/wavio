# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Wavio is a React Native / Expo music streaming client for Android (iOS WIP) that talks to multiple server types: OpenSubsonic, Navidrome and Jellyfin. It alos supports a local music library on the device's file system. Podcast features use the Taddy API. Radio stations are supported via the Radio Browser API.

## Monorepo layout

The repo is a **Bun workspace monorepo** (`workspaces: ["apps/*"]` in the root `package.json`). Two workspaces:

- `apps/mobile/` — the Expo app (everything described under **Architecture** below; all relative paths in this file are rooted here).
- `apps/landing/` — the Astro marketing website (see **Marketing site** below).

Root-level files that govern the whole repo:
- `package.json` — private root; workspace globs, cross-workspace scripts, and `patchedDependencies` (Bun applies patches at install time, so this **must** live at the root, not in `apps/mobile`).
- `bunfig.toml` — pins `linker = "hoisted"` so `node_modules` is flat; RN/Expo tooling (Metro) and `jest-expo`'s `transformIgnorePatterns` assume a hoisted layout, not Bun's isolated/symlinked default.
- `bun.lock` (single root lockfile), `.bun-version`, `patches/`, `.gitignore`.

One `bun install` at the root installs both workspaces. When bumping a patched dep (`expo-audio`, `lucide-react-native`, `zod`) keep the version exactly matching the `patchedDependencies` key — e.g. `expo-audio` is pinned to an exact `56.0.10` so its patch applies.

## Commands

Package manager is **bun** (see `bun.lock`), though README still references pnpm. Use `bun install` / `bun run <script>`.

Run from the **repo root** (delegate to a workspace via `--cwd`):
- `bun run mobile:start` / `mobile:android` / `mobile:ios` / `mobile:web` — Expo dev client (sets `DARK_MODE=media`)
- `bun run mobile:lint` / `mobile:lint:fix` — Biome check (formatter + linter, replaces ESLint/Prettier)
- `bun run mobile:test` — `jest` (preset `jest-expo`)
- `bun run mobile:typecheck` — `tsc --noEmit`
- `bun run mobile:prebuild` — regenerate `apps/mobile/android/` and `apps/mobile/ios/`
- `bun run landing:dev` / `landing:build` / `landing:preview` — Astro marketing site

Or run inside a workspace directly: `bun run --cwd apps/mobile <script>`, or `cd apps/mobile && bun run <script>`. Single mobile test: `cd apps/mobile && bunx jest __tests__/queue.store.test.ts`. APK build: `cd apps/mobile && eas build --profile preview --platform android` (profiles in `apps/mobile/eas.json`).

`apps/mobile/.env` holds `EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION` and `EXPO_PUBLIC_NAVIDROME_CLIENT`, which are injected into every Subsonic request.

TS path alias: `@/*` → `apps/mobile/` root.

Don't execute prebuild and building the mobile app yourself. Also don't launch the landing dev server youself. Inform the user to do so.

## Architecture

Everything in this section lives in `apps/mobile/`; paths are written relative to it.

### Routing (expo-router, file-based)

`app/` uses route groups:
- `app/(auth)/login.tsx` — unauthenticated flow
- `app/(app)/(tabs)/(home|library|search)/` — three stacked tab groups, each owns its own nested stack (albums, artists, playlists, etc.). Duplicated screens like `settings.tsx` / `servers.tsx` across tab groups are intentional so back-stack stays within the active tab.
- `app/(app)/player.tsx`, `app/(app)/playlists/`, `app/(app)/internet-radio-stations/` — modal / full-screen routes outside the tab bar
- Root `app/_layout.tsx` wires all providers: `QueryClientProvider`, `KeyboardProvider`, `GluestackUIProvider`, `ThemeProvider`, `GestureHandlerRootView`, `BottomSheetModalProvider`, plus online/focus managers (effective connectivity → react-query `onlineManager`, AppState → `focusManager` + a foreground reachability probe) and i18n/zod locale bootstrapping.

### Server backends (multi-protocol)

Three server types are supported, tracked by `ServerType` in `stores/servers.ts`: `navidrome`, `opensubsonic`, `jellyfin`. The active server's type is mirrored on `useAuthBase().serverType` (`stores/auth.ts`).

Each backend has its own service tree mirroring the same API sections:
- `services/openSubsonic/*.ts` — axios calls for Subsonic / OpenSubsonic / Navidrome. `services/openSubsonic/index.ts` exports a shared axios instance (15s `timeout`) whose request interceptor injects `u`, `p`, `v`, `c`, `f=json` from `useAuthBase` and sets `baseURL` from the active server URL. Response interceptor logs out **only** on Subsonic error code 40 (wrong credentials); network errors never log out, so offline mode keeps the session alive.
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
Radio stations services use the Radio Browser API.

### State (zustand + MMKV)

All persisted state is zustand with `react-native-mmkv` as the backing store (`config/storage.ts`). Key stores in `stores/`:
- `auth.ts` — active server credentials (`useAuthBase`, used by the axios interceptor)
- `servers.ts` — saved server list
- `app.ts` — app-wide settings (locale, theme, etc.)
- `queue.ts` — playback queue (tested in `__tests__/queue.store.test.ts`)
- `playlists.ts`, `podcasts.ts`, `radioStations.ts`, `recentPlays.ts`, `recentSearches.ts`, `offline.ts`

`createScopedStorage(scope)` in `config/storage.ts` namespaces storage per server+user; use `getAuthScope(url, username)` to build the scope key so switching servers doesn't bleed state.

`utils/createSelectors.ts` auto-generates typed selector hooks for a store.

### Playback

`expo-audio` is the audio engine. `services/player.ts` is the registered background service; the queue store drives it. Offline downloads go through `services/offlineDownloadService.ts` + `hooks/useOfflineDownloads.ts` using `expo-file-system`.

Realtime playback state for non-React consumers (widget, Android Auto) goes through `hooks/player/playbackSnapshot.ts`: call `getPlaybackSnapshot()` for the current state and `subscribePlaybackStatus(cb)` to observe changes.

### Connectivity & offline detection

`services/network.ts` is the connectivity singleton (wired once at root via `initConnectionType`) and models **two** axes:
- **device online** — NetInfo `isConnected` (`getIsOnline` / `useIsDeviceOnline`).
- **server reachable** — whether the active server answered its last `ping` probe (`probeServer`, which enforces its own short deadline). The device can be online while the server is unreachable (e.g. its LAN IP changed after switching networks).

`getIsEffectivelyOnline()` = device online **AND** server reachable, and is what almost all UI keys off: `useIsOnline()` returns the effective value; use `useIsDeviceOnline()` only to distinguish "no internet" from "server unreachable" (e.g. `OfflineBanner` copy). React Query's `onlineManager` tracks the effective value, so it pauses refetches and serves cache instead of hammering an unreachable server. `probeServer()` runs on app foreground, on a device offline→online transition, on a recovery poll while unreachable, and on cold start / server switch (`resetServerReachable()` clears the previous server's state).

The two states are handled differently on purpose: **offline** (no network) keeps the session alive so cached content / offline mode keep working, whereas a server that stays **unreachable while the device is online** is treated as genuinely gone — after `DISCONNECT_AFTER_FAILURES` consecutive failed probes (~24s) `services/network.ts` calls `useAuthBase.logout()` (clearing credentials + query cache) so the user lands on the login/server screen instead of stale cache. The failure counter resets on any successful probe or when the device drops offline, so transient blips don't log you out. This auto-detected state is independent of the user-toggled `offlineModeEnabled` (`stores/offline.ts`, which governs downloads).

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

- Styling: **Uniwind** + Tailwind (`global.css`). Component library is **Gluestack UI v5** (`components/ui/`) — prefer these primitives over raw RN components.
- Lists use `@shopify/flash-list`; `components/DraggableFlashList.tsx` adds reorder.
- Bottom sheets via `@gorhom/bottom-sheet` (provider wired at root).
- i18n: `i18next` + `react-i18next`, locales in `i18n/`, configured in `config/i18n.ts`. Zod error messages follow the selected locale (`z.config(z.locales[locale]())`).
- Icons: `lucide-react-native`.

### Testing

Jest with `jest-expo` preset. Tests live in `apps/mobile/__tests__/`.

## Marketing site (`apps/landing`)

Static [Astro](https://astro.build/) website (Astro 6) for the marketing/landing page, separate from the Expo app and with no shared code.

- Styling is **Tailwind v4** via the `@tailwindcss/vite` plugin (`astro.config.mjs`); global styles in `src/styles/global.css`. Fonts (Inter) are loaded through Astro's `fonts` config (Google provider).
- **i18n**: Astro's built-in i18n, locales `en` (default, unprefixed) + `fr`, configured in `astro.config.mjs`. Translation strings and helpers live in `src/i18n/` (`ui.ts`, `assets.ts`, `utils.ts`); locale-specific screenshots are suffixed `-en` / `-fr` in `src/assets/`.
- Pages in `src/pages/` (`index.astro`, `privacy.astro`), composed from components in `src/components/` (`Home.astro`, `Nav.astro`, `Footer.astro`, `Privacy.astro`) wrapped by `src/layouts/Layout.astro`. Shared constants in `src/consts.ts`.
- Dev/build with `bun run landing:dev` / `landing:build` from the root (output is static, to `apps/landing/dist/`).

## Conventions

- Biome (in `apps/mobile`) enforces double quotes, 2-space indent. Run `bun run mobile:lint:fix` before committing. Its `vcs.root` points at the monorepo root (`../..`) so it reads the root `.gitignore`. The landing site has no Biome config.
- Bun applies patches from the root `patches/` during install; check it before upgrading patched deps, and keep the dep version matching the `patchedDependencies` key.
- Native directories `apps/mobile/android/` and `apps/mobile/ios/` are generated by `expo prebuild` but currently committed — edits there can be overwritten by prebuild.
- Don't write comments unless absolutely necessary (complex feature, critical reminder, etc.). Rather aim to make the code self-explanatory.
