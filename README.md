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

## Features

- Home screen with recently added, most played, highest rated, and favorites
- Artist screen with albums, songs, liked songs, and similar artists
- Album screen with songs and similar albums
- Playlist screen with songs
- Search screen with genres, artists, albums, and songs
- Recent searches history
- Library screen with starred, playlists, albums, and artists
- Liked songs screen
- Player screen with audio controls and synchronized lyrics
- Floating player for easy access to the currently playing song
- Queue screen with reordering support
- Similar songs screen with songs similar to the selected song
- Podcasts screen with podcast series and episodes (provided by Taddy API)
- Internet radio stations from Navidrome
- Offline downloads of favorited songs
- Music folders (libraries) filtering across home, search, and library
- Activity screen with now playing users
- Share screen with shareable links
- Servers screen with multiple servers support
- Settings screen with server scanning, offline downloads, content and display settings
- French and English translations

## Useful links

- OpenSubsonic API documentation: https://opensubsonic.netlify.app/docs/
- Navidrome documentation: https://www.navidrome.org/docs/
- Expo documentation: https://docs.expo.dev/
- React Native documentation: https://reactnative.dev/
