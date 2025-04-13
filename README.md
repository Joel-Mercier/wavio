# Wavio

Music streaming app for Android compatible with Navidrome and OpenSubsonic APIs.

## TODO
- [ ] Add remove from playlist feature
- [ ] Finish recent plays feature
- [ ] Finish recent searches feature
- [ ] Fix playlist edit drag and drop list (list header is ignored)
- [x] Fix search performance issues
- [x] Add proper form handling library and replace all forms with it
- [ ] Add support for iOS
- [ ] Add support for offline mode
- [ ] Add support for podcasts
- [x] Add sharing support
- [ ] Add user authentication

## Getting started

1. Clone the repository
2. Install dependencies with `npm install`
3. Set environment variables in `.env` file
4. Prebuild the native development app with `npx expo prebuild`
5. Run the app with `npx expo start`


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
- `npm run lint`: Lint the codebase
- `npm run lint:fix`: Fix linting issues
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
- React Native Track Player documentation: https://rntp.dev/docs/basics/installation
- React Navigation documentation: https://reactnavigation.org/docs/getting-started/

## Notes

- Using https://github.com/weights-ai/react-native-track-player fork for React Native Track Player because the new architecture is not supported and project seems unmaintained.
- Using override for `@react-aria/utils` to fix issue with current Gluestack UI version.