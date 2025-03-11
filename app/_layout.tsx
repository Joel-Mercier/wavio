import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import "@/global.css";
import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import { useLogTrackPlayerState } from "@/hooks/useLogTrackPlayerState";
import { useSetupTrackPlayer } from "@/hooks/useSetupTrackPlayer";
import PlaybackService from "@/services/playbackService";
import TrackPlayer from "@weights-ai/react-native-track-player";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

TrackPlayer.registerPlaybackService(() => PlaybackService);

export default function RootLayout() {
  // const trackPlayerLoaded = useSetupTrackPlayer();
  // useLogTrackPlayerState();
  const trackPlayerLoaded = true;

  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_300Light,
    Inter_700Bold,
  });

  useEffect(() => {
    if (loaded && trackPlayerLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, trackPlayerLoaded]);

  if (!loaded || !trackPlayerLoaded) {
    return null;
  }

  return (
    <GluestackUIProvider mode="light">
      <ThemeProvider value={DarkTheme}>
        <Stack
          screenOptions={{
            navigationBarColor: "rgb(24,23,25)",
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="albums/[id]/index"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="playlists/[id]/index"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="artists/[id]/index"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="dark" />
      </ThemeProvider>
    </GluestackUIProvider>
  );
}
