# Wavio

Music streaming app for Android compatible with Navidrome and OpenSubsonic APIs.

## TODO

- [ ] Check if https://github.com/PedroBern/react-native-collapsible-tab-view works for podcast series screen
- [ ] Add support for iOS
- [ ] Banner when network is down
- [ ] Finish top songs feature
- [ ] Make server switching work
- [ ] Get good design elements (logo, icon, splash screen, bg elements, ...)
- [ ] Spotify-like queue handling (https://www.howtogeek.com/spotifys-play-queue-is-the-best-in-the-business-heres-why/#:~:text=do%20they%20work%3F-,How%20a%20Play%20Queue%20Works%20in%20General,to%20play%20after%20each%20other.&text=When%20you%20press%20play%20on,are%20added%20to%20the%20queue.)
- [ ] Support Jellyfin (https://api.jellyfin.org/)

## Getting started

1. Clone the repository
2. Make sure you have pnpm installed (`npm i -g pnpm`)
3. Install dependencies with `pnpm install`
4. Set environment variables in `.env` file
5. Prebuild the native development app with `npx expo prebuild`
6. Run the app with `npx expo start`


## Building the app

### Android

1. Make sure you have the correct environnement for building on Android (Android Studio, SDK, Java, etc.)
2. Make sure you are logged in to Expo with `eas login` (check with `eas whoami`)
3. Build the app with the desired profile `eas build --profile preview --platform android`
4. Install the app on your device with the generated APK file

### iOS

TODO

## Useful commands

- `npx expo start`: Start the app in development mode
- `npx expo start --web`: Start the app in development mode with web support
- `npx expo build:android`: Build the app for Android
- `npx expo build:ios`: Build the app for iOS
- `npx expo prebuild`: Prebuild the native development app
- `npx expo doctor`: Check the app for any potential issues
- `pnpm run lint`: Lint the codebase
- `pnpm run lint:fix`: Fix linting issues
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

## Uselful links

- OpenSubsonic API documentation: https://opensubsonic.netlify.app/docs/
- Navidrome documentation: https://www.navidrome.org/docs/
- Expo documentation: https://docs.expo.dev/
- React Native documentation: https://reactnative.dev/
- React Native Audio Pro documentation: https://rnap.dev/
- React Navigation documentation: https://reactnavigation.org/docs/getting-started/
