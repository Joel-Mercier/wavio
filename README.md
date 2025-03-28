# Wavio

## Getting started

1. Clone the repository
2. Install dependencies with `npm install`
3. Set environment variables in `.env` file
4. Prebuild the native development app with `npx expo prebuild`
5. Run the app with `npx expo start`

## Useful commands

- `npx expo start`: Start the app in development mode
- `npx expo start --web`: Start the app in development mode with web support
- `npx expo build:android`: Build the app for Android
- `npx expo build:ios`: Build the app for iOS
- `npx expo doctor`: Check the app for any potential issues
- `npm run lint`: Lint the codebase
- `npm run lint:fix`: Fix linting issues

## Features

- Home screen with recently added, most played, highest rated, and favorites
- Artist screen with albums, songs, and similar artists
- Album screen with songs, and similar albums
- Playlist screen with songs
- Search screen with genres, artists, albums, and songs
- Library screen with starred, playlists, albums, and artists
- Settings screen with user information and settings

## Uselful links

- OpenSubsonic API documentation: https://opensubsonic.netlify.app/docs/
- Navidrome documentation: https://www.navidrome.org/docs/
- Expo documentation: https://docs.expo.dev/
- React Native documentation: https://reactnative.dev/

## Notes

- Using https://github.com/weights-ai/react-native-track-player fork for React Native Track Player because the new architecture is not supported and project seems unmaintained.
- Using override for `@react-aria/utils` to fix issue with current Gluestack UI version.