# Wavio

Music streaming app for Android compatible with Navidrome, Jellyfin and OpenSubsonic APIs.

[![CI](https://github.com/Joel-Mercier/wavio/actions/workflows/ci.yml/badge.svg)](https://github.com/Joel-Mercier/wavio/actions/workflows/ci.yml)

## Features

- Supports Navidrome, OpenSubsonic and Jellyfin (beta) servers
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
- Podcasts screen with podcast series and episodes (provided by Taddy API, 500 monthly free requests)
- Internet radio stations, listen to radio streams
- Offline downloads of favorited songs
- Music folders (libraries) discovery and filtering across home, search, and library
- Activity screen with now playing users
- Share screen with shareable links
- Servers screen with multiple servers support
- Settings screen with server scanning, offline downloads, playback, content and display settings
- Gapless playback, crossfade, replay gain, equalizer and sleep timer
- Profile screen with user playlists
- Edit profile screen with account info and password change
- Android homescreen widgets
- Android Auto support
- Navidrome smart playlists beta support
- French and English translations

## Development

### Getting started

1. Clone the repository
2. Make sure you have Node v22+ installed
3. Make sure you have bun installed
4. Install dependencies with `bun install`
5. Set environment variables in `.env` file
6. Prebuild the native development app with `bun run prebuild`
7. Run the app with `bun run start`

### Android

1. Make sure you have the correct environnement for building on Android (Android Studio, SDK, Java, etc.)
2. Make sure you are logged in to Expo with `eas login` (check with `eas whoami`)
3. Build the app with the desired profile `eas build --profile preview --platform android`
4. Install the app on your device with the generated APK file

#### Android Auto

In order to test Android Auto, you need to :
1. Install the Android Auto Desktop Head Unit Emulator via Android Studio in SDK Manager > SDK Tools > Android Auto Desktop Head Unit Emulator.
2. Make sure to enable the developer mode in your devices Android Auto settings by tapping the version number 10 times.
3. Run the head unit server in the Android Auto settings
4. On your development machine, run `adb forward tcp:5277 tcp:5277` and start the emulator with `~/Library/Android/sdk/extras/google/auto/desktop-head-unit`
5. You can check the logs related to the android auto service with `adb logcat -c && adb logcat ReactNativeJS:V CarAuto:V "*:S"`

### iOS

TODO

### Useful commands

- `bun run start`: Start the app in development mode
- `bun run android`: Start the app in development mode on Android
- `bun run ios`: Start the app in development mode on iOS
- `bun run web`: Start the app in development mode with web support
- `bun run prebuild`: Prebuild the native development app
- `bun run doctor`: Check the app for any potential issues
- `bun run lint`: Lint the codebase
- `bun run lint:fix`: Fix linting issues
- `bun run test`: Run the test suite
- `eas build --profile preview --platform android`: Build the app for Android with the desired profile and platform (add `--local` to build locally)
- `eas whoami`: Check the current user
- `eas login`: Login to Expo

## Useful links

- OpenSubsonic API documentation: https://opensubsonic.netlify.app/docs/
- Navidrome documentation: https://www.navidrome.org/docs/
- Expo documentation: https://docs.expo.dev/
- React Native documentation: https://reactnative.dev/
