# Wavio

Music streaming app for Android compatible with Navidrome and OpenSubsonic APIs.

## Getting started

1. Clone the repository
2. Make sure you have Node v22+ installed
3. Make sure you have bun installed
4. Install dependencies with `bun install`
5. Set environment variables in `.env` file
6. Prebuild the native development app with `bun run prebuild`
7. Run the app with `bun run start`


## Building the app

### Android

1. Make sure you have the correct environnement for building on Android (Android Studio, SDK, Java, etc.)
2. Make sure you are logged in to Expo with `eas login` (check with `eas whoami`)
3. Build the app with the desired profile `eas build --profile preview --platform android`
4. Install the app on your device with the generated APK file

### iOS

TODO

## Useful commands

- `bun run start`: Start the app in development mode
- `bun run web`: Start the app in development mode with web support
- `bunx --bun expo build:android`: Build the app for Android
- `bunx --bun expo build:ios`: Build the app for iOS
- `bun run prebuild`: Prebuild the native development app
- `bun run doctor`: Check the app for any potential issues
- `bun run lint`: Lint the codebase
- `bun run lint:fix`: Fix linting issues
- `eas build --profile preview --platform android`: Build the app for Android with the desired profile and platform (add `--local` to build locally)
- `eas whoami`: Check the current user
- `eas login`: Login to Expo

## Features

- Home screen with recently added, most played, highest rated, and favorites
- Artist screen with albums, songs, and similar artists
- Album screen with songs, and similar albums
- Playlist screen with songs
- Search screen with genres, artists, albums, and songs
- Library screen with starred, playlists, albums, and artists
- Player screen with audio controls
- Floating player for easy access to currently playing song
- Settings screen with user information and settings
- Simlar songs screen with songs similar to the selected song
- Podcasts screen with podcasts (provided by Taddy API)
- Internet radio stations from Navidrome
- Offline downloads of favorited songs
- Settings screen with server scanning, offline downloads, content and display settings
- Share screen with shareable links
- Servers screen with multiple servers support
- French and English translations

## Uselful links

- OpenSubsonic API documentation: https://opensubsonic.netlify.app/docs/
- Navidrome documentation: https://www.navidrome.org/docs/
- Expo documentation: https://docs.expo.dev/
- React Native documentation: https://reactnative.dev/
- React Native Audio Pro documentation: https://rnap.dev/
- React Navigation documentation: https://reactnavigation.org/docs/getting-started/
- Gluestack UI documentation: https://gluestack.io/ui/docs
