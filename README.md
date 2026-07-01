# Wavio

<p align="center">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/mobile/assets/images/logo.svg" alt="Wavio logo" width="200" height="200">
</p>

Music streaming app for Android compatible with Navidrome, Jellyfin and OpenSubsonic servers or a local library.

[![CI](https://github.com/Joel-Mercier/wavio/actions/workflows/ci.yml/badge.svg)](https://github.com/Joel-Mercier/wavio/actions/workflows/ci.yml)

[Presentation website](https://wavio-app.vercel.app)

## Table of contents
- [How to install](#how-to-install)
- [Features](#features)
- [Development](#development)
- [Translations](#translations)
- [Useful links](#useful-links)
- [Gallery](#gallery)

## How to install

For now you can only install the app from the [releases page](https://github.com/Joel-Mercier/wavio/releases).

You can also apply for the closed testing beta on the Google Play Store in order for the app to be published.
To do that I need your email address, so I can send you the link to the beta testing page.

I'm also currently working on a [F-Droid](https://f-droid.org/) package.


### Use Android Auto with a APK install

Android Auto doesn't detect Wavio automatically if you installed the app via APK on Github, Android Auto detects only Play Store apps automatically. To see Wavio with a APK install on Android Auto : 

1. On the phone, open Android Auto settings  (Settings → Connected devices → Android Auto, or open the standalone Android Auto app's settings,  varies by phone).
2. Scroll to the bottom and tap "Version" ~10 times until it says developer mode is enabled.
3. Tap the ⋮ overflow menu (top right) → Developer settings.
4. Turn on "Unknown sources" (sometimes worded "Add new apps to launcher" or "Unknown sources").
5. Reconnect the phone to the car (unplug/replug, or restart the Android Auto session).
6. If it still doesn't show, check Customize launcher in Android Auto settings and make sure Wavio is  enabled/checked.

## Features

- Supports Navidrome, OpenSubsonic and Jellyfin servers or a local library
- Home screen with shortcuts and recently played, recently added, most played, more from artist, highest rated, random and internet radio stations sections
- Artist screen with albums, songs, liked songs, and similar artists
- Album screen with songs and similar albums
- Playlist screen with songs list and editing
- Search screen with genres, artists, albums, and songs
- Recent searches history
- Library screen with starred, playlists, albums, and artists
- Liked songs screen
- Player screen with audio controls and synchronized lyrics
- Floating player for easy access to the currently playing song
- Queue screen with clearing, editing and reordering support
- Similar songs screen with songs similar to the selected song
- [AudioMuse-AI](https://github.com/NeptuneHub/AudioMuse-AI) support for AI powered sonic similarity
- Podcasts screen with search, podcast series and episodes (provided by Taddy API, 500 monthly free requests)
- Internet radio stations, listen to radio streams, browse and search (provided by the Radio Browser API, free for non-commercial use)
- Offline downloads of favorited songs, downloads management screen
- Music folders (libraries) discovery and filtering across home, search, and library
- Activity screen with now playing users
- Share screen with shareable links
- Servers screen with multiple servers support
- Settings screen with server scanning, offline downloads, playback, content, display and backup settings
- Endless playback, replay gain, equalizer and sleep timer
- Profile screen with user playlists
- Edit profile screen with account info and password change
- Synced lyrics support and retrieval through lrclib.net
- Bookmarks support. Easy access to a song or podcast favorite parts
- Landscape mode support
- Android homescreen widgets
- Android Auto support
- Navidrome smart playlists beta support
- Navidrome/Opensubsonic jukebox mode support
- Backup and restore
- Automatic metadata extraction from local files, uses embedded metadata if available or falls back to file system and file name heuristics
- English, French, Chinese and Russian translations

## Development

This repository is a [Bun workspace](https://bun.sh/docs/pm/workspaces) monorepo with two workspaces:

- `apps/mobile` — the Expo mobile app
- `apps/landing` — the [Astro](https://astro.build/) marketing website

A single `bun install` at the repo root installs both. Most scripts are exposed at the root as `mobile:*` / `landing:*` (which delegate to the relevant workspace), or you can run a workspace's own scripts with `bun run --cwd apps/<workspace> <script>`.

### Getting started

1. Clone the repository
2. Make sure you have Node v22+ installed
3. Make sure you have bun installed
4. Install dependencies with `bun install` (from the repo root)
5. Set environment variables in EAS secrets (see `.env.example`)
6. Prebuild the native development app with `bun run mobile:prebuild`
7. Run the app with `bun run mobile:start` and make sure you have a development build for the targetted platform (`bun run mobile:android` or `bun run mobile:ios`)

### Android

1. Make sure you have the correct environnement for building on Android (Android Studio, SDK, Java, etc.)
2. Make sure you are have the SENTRY_AUTH_TOKEN and are logged in to the sentry-cli with `sentry-cli login`
3. Make sure you are logged in to Expo with `eas login` (check with `eas whoami`)
4. Build the app with the desired profile `bun run mobile:build:android:<profile>`
5. Install the app on your device with the generated APK file

#### Android Auto

In order to test Android Auto, you need to :
1. Install the Android Auto Desktop Head Unit Emulator via Android Studio in SDK Manager > SDK Tools > Android Auto Desktop Head Unit Emulator.
2. Make sure to enable the developer mode in your devices Android Auto settings by tapping the version number 10 times.
3. Run the head unit server in the Android Auto settings
4. On your development machine, run `adb forward tcp:5277 tcp:5277` and start the emulator with `~/Library/Android/sdk/extras/google/auto/desktop-head-unit`
5. Enable `Unknown sources` in Android Auto's developer settings (⋮ menu > Developer settings > Unknown sources) if the app doesn't show up in the emulator
6. You can check the logs related to the android auto service with `adb logcat -c && adb logcat ReactNativeJS:V CarAuto:V "*:S"`

### iOS

Mostly functional, no carplay or widgets support yet. No plan yet to publish to the App Store.

### Marketing website (`apps/landing`)

The landing page is a static [Astro](https://astro.build/) site (Tailwind v4, `en`/`fr` i18n), independent from the mobile app.

1. Install dependencies with `bun install` (from the repo root, shared with the app)
2. Start the local dev server with `bun run landing:dev` (defaults to `localhost:4321`)
3. Build the production site with `bun run landing:build` (output to `apps/landing/dist/`)
4. Preview the built site with `bun run landing:preview`

For Astro CLI commands, run them inside the workspace: `cd apps/landing && bun run astro ...`.

### E2E tests

The mobile app has E2E tests that are powered by [Maestro](https://docs.maestro.dev/).
To run the tests, you need to have the [Maestro CLI installed](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli) and need access to a iOS or Android simulator.
The test scenarios are defined in `apps/mobile/maestro/flows`. Each flow is a sequence of steps that are executed in order.
To run the tests, run `maestro test apps/mobile/maestro/` from the repo root.
You can find more information about the test scenarios in the [E2E tests README](apps/mobile/maestro/README.md).

### Useful commands

Run from the repo root:

- `bun run mobile:start`: Start the app in development mode
- `bun run mobile:android`: Start the app in development mode on Android
- `bun run mobile:ios`: Start the app in development mode on iOS
- `bun run mobile:web`: Start the app in development mode with web support
- `bun run mobile:prebuild`: Prebuild the native development app
- `bun run mobile:typecheck`: Type-check the app
- `bun run mobile:lint`: Lint the codebase
- `bun run mobile:lint:fix`: Fix linting issues
- `bun run mobile:test`: Run the test suite
- `bun run landing:dev`: Start the marketing site dev server
- `bun run landing:build`: Build the marketing site
- `bun run landing:preview`: Preview the built marketing site
- `bun run doctor` (inside `apps/mobile`): Check the app for any potential issues
- `eas build --profile preview --platform android` (inside `apps/mobile`): Build the app for Android with the desired profile and platform (add `--local` to build locally)
- `eas whoami`: Check the current user
- `eas login`: Login to Expo

## Translations

Wavio is available in multiple languages thanks to the community. If you want to help translate the app, please join the [Crowdin project](https://crowdin.com/project/wavio) and help us translate the app to your language.

If your language isn't listed, please open an issue to request it.

[![Crowdin](https://badges.crowdin.net/wavio/localized.svg)](https://crowdin.com/project/wavio)

Currently supported languages: English, French, Chinese, Russian.

## Useful links

- [OpenSubsonic API documentation](https://opensubsonic.netlify.app/docs/)
- [Navidrome documentation](https://www.navidrome.org/docs/)
- [Jellyfin documentation](https://jellyfin.org/docs/)
- [Expo documentation](https://docs.expo.dev/)
- [React Native documentation](https://reactnative.dev/)

## Gallery

<p align="center">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/login-en.jpg" alt="Login screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/home-en.jpg" alt="Home screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/artist-en.jpg" alt="Artist screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/album-en.jpg" alt="Album screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/player-en.jpg" alt="Player screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/queue-en.jpg" alt="Queue screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/library-en.jpg" alt="Library screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/smart-playlist-en.jpg" alt="Smart playlist screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/offline-1-en.jpg" alt="Offline downloads screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/settings-en.jpg" alt="Settings screen" width="200">
<img src="https://raw.githubusercontent.com/Joel-Mercier/wavio/refs/heads/main/apps/landing/src/assets/android-auto-en.png" alt="Android Auto" width="200">
</p>
