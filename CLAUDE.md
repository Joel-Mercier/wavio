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

One `bun install` at the root installs both workspaces. Every patched dep (`expo-audio`, `expo-font`, `expo-navigation-bar`, `lucide-react-native`, `zod`) is declared with an **exact** version in `apps/mobile/package.json`, because `patchedDependencies` keys are exact-version: if the resolved version drifts off the key, Bun applies nothing and **prints no warning** — the app still builds, just silently unpatched. A tilde/caret range is enough to cause this on any lockfile re-resolve, even without selecting the package in `bun update -i`; a hoisted transitive bump can also force it (`expo` depends on `expo-font`, so updating `expo` moves it). When bumping one, rename the patch file, update the key, re-pin the exact version, then verify the patch actually landed in `node_modules` rather than trusting a clean install.

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

### Environment variables

Secrets are **not** committed to `eas.json`. They live in EAS server-side environment variables, scoped per environment (`development` / `preview` / `production`), created with `eas env:create`. Each `eas.json` build profile sets an `environment` so `eas build` (cloud **or** `--local`) pulls the matching bucket.

Where each var belongs:
- `EXPO_PUBLIC_OPENSUBSONIC_API_VERSION`, `EXPO_PUBLIC_CLIENT_NAME`, `EXPO_PUBLIC_ENV` — non-secret; kept inline in each profile's `env` block in `apps/mobile/eas.json`.
- `EXPO_PUBLIC_TADDY_PODCASTS_API_USER_ID`, `EXPO_PUBLIC_TADDY_PODCASTS_API_KEY`, `EXPO_PUBLIC_TADDY_PODCASTS_API_LANGUAGE`, `EXPO_PUBLIC_TADDY_PODCASTS_API_COUNTRY` — EAS `development` environment only (`sensitive`/`plaintext` visibility; they're `EXPO_PUBLIC_` so they end up in the bundle anyway — `secret` would be misleading). They seed the initial `stores/podcasts.ts` state (and `clearTaddyPodcastsConfig` resets back to them) so podcasts work without manually entering config; values set via the in-app settings override them and persist. Language/country must be valid `Language`/`Country` enum keys (e.g. `FRENCH`/`FRANCE`). Absent in preview/production builds → the app falls back to in-app Taddy config.
- `SENTRY_AUTH_TOKEN` — build-time only (sourcemap upload), **not** `EXPO_PUBLIC_`, so never in the bundle. EAS `preview` + `production` only. Use **`sensitive`, not `secret`**: `secret` values are not readable outside EAS servers, so a local build (`eas build --local`) can't receive them — `sensitive` can.

`EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time; `EXPO_PUBLIC_` values are extractable from a shipped APK, so EAS scoping protects them in git/logs but does not make a client-embedded key truly secret.

The dev-server scripts (`start` / `android` / `ios` / `web` in `apps/mobile/package.json`) are wrapped with `eas env:exec --non-interactive development "…"` because `expo run:android` / `expo start` do **not** pull EAS env vars on their own (only `eas build` does). This injects the Taddy creds for daily dev without a `.env` file — so `.env` stays clean and secrets can't leak into a local `preview`/`production` build (`eas build --local`, which reads both `.env` and EAS). Trade-off: these scripts now require being logged into EAS and online. **Keep secrets out of `.env`**; if you do keep Taddy in a gitignored `.env` for offline convenience, strip it before any local `preview`/`production` build.

The `--non-interactive` flag is **required**, not optional: `eas env:exec`'s default (interactive) mode spawns the command with `stdio: ['inherit', 'pipe', 'pipe']`, piping and reformatting stdout/stderr (with `[stdout]`/`[stderr]` prefixes plus banner lines), which breaks Metro's raw-TTY interactive UI — keypresses like `r` (reload) / `j` (debugger) / `m` (menu) stop working. `--non-interactive` switches it to `stdio: 'inherit'`, a pure passthrough that gives Metro the real TTY and emits no banner noise.

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

Both states degrade to the same offline experience by default: the session stays alive and cached content / downloads keep working whether the device has no network or the server just stopped answering — the only user-visible difference is the `OfflineBanner` copy ("No connection" vs "Can't reach server"). Auto sign-out on an unreachable server is **opt-in** via `autoSignOutOnServerUnreachable` (`stores/app.ts`, default off, toggle in Settings → Downloads & offline): when enabled, after `DISCONNECT_AFTER_FAILURES` consecutive failed probes (~24s) `services/network.ts` corroborates against neutral internet endpoints and, only if the wider internet is up, calls `useAuthBase.logout()` (clearing credentials + query cache). The failure counter resets on any successful probe or when the device drops offline, so transient blips don't log you out. This auto-detected state is independent of the user-toggled `offlineModeEnabled` (`stores/offline.ts`, which governs downloads).

### Android Auto / CarPlay

- `modules/car-auto/` — a local Expo Module that ships the Android Auto `MediaBrowserServiceCompat` implementation (registered as the `CarAuto` native module). The JS bridge in `services/carAuto/bridge.ts` calls `requireOptionalNativeModule("CarAuto")` and exposes `setNodes(json)` / `setNowPlaying(json)` to push the browse tree and now-playing metadata to the car head unit.
- `services/carAuto/tree.ts` builds the browse tree from `services/backend` (so both Subsonic and Jellyfin servers work in the car).
- `services/carAuto/play.ts` handles play intents originating from the car.
- `services/carAuto/carplay.ts` is the iOS counterpart, using `react-native-carplay`. `bridge.ts` is a no-op on iOS.
- `services/carAuto/session.ts` wires all of the above (tree pushes, play/transport listeners, now-playing + queue mirroring) and is started from `index.js`, **not** from a React component. Android Auto binds the media service without ever starting an Activity, so the JS runtime can boot with no UI at all — anything wired from a component would never run in that cold case and taps in the car would silently do nothing (issue #144). For the same reason `session.ts` calls `configurePlayback()` itself. Keep car wiring out of the React tree — and see **Wear OS companion** below for the general rule this is one instance of.
- `ReactHostBoot.kt` starts the React host from the media service when a car host connects or taps with no JS running; `CarAutoModule` parks that tap and replays it when `session.ts` calls `notifyReady()`. Because a cold browse tree comes from the native disk cache, `play.ts` must always be able to resolve a mediaId from the backend rather than only from `tree.ts`'s in-memory snapshot.
- Android Auto native wiring is generated by `plugins/withAndroidAuto.js` during `expo prebuild` — edit that plugin rather than `android/` directly. `plugins/withCarPlay.js` exists but is **not** registered in `app.json`'s `plugins` array, so the CarPlay entitlement / scene wiring is never applied; register it before relying on CarPlay.

### Wear OS companion

- `apps/mobile/wear/` is the watch app itself — native Kotlin/Compose, a **remote control** only: it plays no audio and never talks to a server. It ships as a separate APK and is added to the Gradle build by `plugins/withWearOS.js` during prebuild. Setup, emulator pairing and the manual test protocol are in `apps/mobile/wear/TESTING.md`.
- `modules/wear-bridge/` is the phone-side local Expo Module (registered as `WearBridge`). State, queue and artwork go out over `DataClient` (retained and replicated by Play Services, so a watch reads them without waking the phone); progress and commands use the fire-and-forget `MessageClient`. JS owns the protocol — `services/wear/protocol.ts` — and hands native ready-made JSON.
- `services/wear/session.ts` mirrors playback to the watch and applies its commands. Like the car session it is started from `index.js`, **not** from a React component, and for a superset of the same reason: a component's lifetime is the mounted React *surface*, so it would be dead during a headless Android Auto boot **and** after the app is swiped away with music still playing. Both leave the watch showing retained DataItems — the wrong track with live-looking buttons. It awaits `hydratePlaybackStores()` before its first publish, or it would overwrite the watch's retained state with an un-hydrated (empty) queue.
- The general rule: anything that has to keep working while the process outlives the UI — car, watch, widget — belongs in `services/`, started from `index.js`, subscribing to stores via `getState()` / `subscribe()` and to playback via `hooks/player/playbackSnapshot`. Never wire it from a component.
- A watch tap still cannot wake a fully closed app: `WavioWearListenerService` drops commands when there is no JS runtime and the watch shows "Open Wavio on your phone". Changing that would need the wear equivalent of `ReactHostBoot` + command parking.

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

### i18n & translations (Crowdin)

Translations are managed through the **Crowdin GitHub integration** (`crowdin.yml` at the repo root), which covers both workspaces: `apps/mobile/i18n/en.json` and `apps/landing/src/i18n/en.json` are the sources. Crowdin watches these `en.json` files, and pushes translations back as PRs (e.g. the recurring "New Crowdin updates" PRs) that update the per-locale files (`de.json`, `fr.json`, `it.json`, `ru.json`, `zh-CN.json`, …).

**When adding or changing a locale string, only touch `en.json`** (the default/fallback locale). Don't hand-edit the other locale files — Crowdin owns them, and manual edits get overwritten on the next sync. Add the English key/copy, wire it up in code, and let translation happen in Crowdin.

Locale JSON files are **tab-indented** (Crowdin's format), unlike the rest of the codebase. `bun run mobile:lint:fix` (Biome) will convert them to spaces — restore the tabs afterward if it touches them, so Crowdin diffs stay clean.

### Testing

Jest with `jest-expo` preset. Tests live in `apps/mobile/__tests__/`.

## Marketing site (`apps/landing`)

Static [Astro](https://astro.build/) website (Astro 6) for the marketing/landing page, separate from the Expo app and with no shared code.

- Styling is **Tailwind v4** via the `@tailwindcss/vite` plugin (`astro.config.mjs`); global styles in `src/styles/global.css`. Fonts (Inter) are loaded through Astro's `fonts` config (Google provider).
- **i18n**: Astro's built-in i18n, locales `en` (default, unprefixed) + `fr`, configured in `astro.config.mjs`. Translation strings and helpers live in `src/i18n/` (`ui.ts`, `assets.ts`, `utils.ts`); locale-specific screenshots are suffixed `-en` / `-fr` in `src/assets/`.
- Pages in `src/pages/` (`index.astro`, `privacy.astro`), composed from components in `src/components/` (`Home.astro`, `Nav.astro`, `Footer.astro`, `Privacy.astro`) wrapped by `src/layouts/Layout.astro`. Shared constants in `src/consts.ts`.
- Dev/build with `bun run landing:dev` / `landing:build` from the root (output is static, to `apps/landing/dist/`).

## Conventions

- Biome enforces double quotes, 2-space indent. Run `bun run mobile:lint:fix` before committing. Config is split Biome-v2-monorepo style: the **root `biome.json`** holds the shared formatter/linter rules and `vcs.root: "."` (so it reads the root `.gitignore`), and `apps/mobile/biome.json` is a nested config (`"extends": "//"`) that only adds mobile-specific `files.includes` exclusions. `apps/landing` is excluded at the root — the landing site has no Biome config.
- The root config must stay at the repo root: the Biome VS Code extension resolves config per *workspace folder*, and `biome.requireConfiguration` defaults to `false`, so if it finds no config it formats with Biome's built-in defaults (**tabs**) and silently reindents whole files on save. `.vscode/settings.json` sets `biome.requireConfiguration: true` as a backstop. Note VS Code only reads `.vscode/settings.json` from workspace *roots*, so that backstop is inactive if the repo is opened as a nested folder of a larger multi-root workspace.
- Bun applies patches from the root `patches/` during install; check it before upgrading patched deps, and keep the dep version exactly matching the `patchedDependencies` key (see **Monorepo layout** — a mismatch unpatches silently). The Kotlin patches only reach the build because `expo.autolinking.android.buildFromSource` in `apps/mobile/package.json` lists `expo-audio` and `expo-font`; without that, prebuilt Maven artifacts are used and the patched sources are ignored.
- Native directories `apps/mobile/android/` and `apps/mobile/ios/` are **gitignored** and generated by `expo prebuild` (CNG) — never edit them, changes are wiped on the next prebuild. All native customization goes through `app.json` config fields, the config plugins in `apps/mobile/plugins/`, or the local Expo modules in `apps/mobile/modules/` (whose own `android/` / `ios/` dirs *are* tracked source). EAS Build runs prebuild itself; after changing `app.json` or a plugin, run `bun run mobile:prebuild` before a local `expo run:*`, and `bunx pod-install` for iOS.
- Don't write comments unless absolutely necessary (complex feature, critical reminder, etc.). Rather aim to make the code self-explanatory.
