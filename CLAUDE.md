# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Wavio is a React Native / Expo music streaming client for Android (iOS WIP) that talks to [OpenSubsonic](https://opensubsonic.netlify.app/docs/) / Navidrome servers. Podcast features use the Taddy API.

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

### Subsonic API layer

Two parallel trees mirror the OpenSubsonic API spec sections:
- `services/openSubsonic/*.ts` — axios calls. `services/openSubsonic/index.ts` exports a shared axios instance whose request interceptor injects `u`, `p`, `v`, `c`, `f=json` from `useAuthBase` (zustand) and sets `baseURL` from the active server URL. Response interceptor logs out on `ERR_NETWORK`.
- `hooks/openSubsonic/*.ts` — `@tanstack/react-query` hooks wrapping those services (one hook file per API section: browsing, lists, searching, playlists, mediaAnnotation, mediaRetrieval, sharing, bookmarks, users, system, mediaLibraryScanning, internetRadioStations).

When adding a Subsonic endpoint, add the raw call in `services/openSubsonic/<section>.ts` and expose it through the matching `hooks/openSubsonic/use<Section>.ts`. Types live in `services/openSubsonic/types.ts`. Error codes are translated via `openSubsonicErrorCodes` using `config/i18n`.

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
