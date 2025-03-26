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
import FloatingPlayer from "@/components/FloatingPlayer";
import { useLogTrackPlayerState } from "@/hooks/useLogTrackPlayerState";
import { useSetupTrackPlayer } from "@/hooks/useSetupTrackPlayer";
import PlaybackService from "@/services/playbackService";
import { OverlayProvider } from "@gluestack-ui/overlay";
import { ToastProvider } from "@gluestack-ui/toast";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import NetInfo from "@react-native-community/netinfo";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import TrackPlayer from "@weights-ai/react-native-track-player";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DevToolsBubble } from "react-native-react-query-devtools";
import {
  ReanimatedLogLevel,
  configureReanimatedLogger,
} from "react-native-reanimated";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

TrackPlayer.registerPlaybackService(() => PlaybackService);

const queryClient = new QueryClient();

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // Reanimated runs in strict mode by default
});

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}

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

  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => subscription.remove();
  }, []);

  if (!loaded || !trackPlayerLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GluestackUIProvider mode="light">
        <ThemeProvider value={DarkTheme}>
          <OverlayProvider>
            <ToastProvider>
              <GestureHandlerRootView
                style={{ flex: 1, backgroundColor: "#191A1F" }}
              >
                <BottomSheetModalProvider>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      navigationBarColor: "rgb(24,23,25)",
                    }}
                  >
                    <Stack.Screen
                      name="(tabs)"
                      options={{ headerShown: false }}
                    />
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
                    <Stack.Screen
                      name="genres/[id]/index"
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="favorites"
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="settings"
                      options={{ headerShown: false }}
                    />
                    {/* <Stack.Screen
                        name="player"
                        options={{
                          headerShown: false,
                          presentation: "card",
                          gestureEnabled: true,
                          gestureDirection: "vertical",
                          animationDuration: 400,
                        }}
                      /> */}
                    <Stack.Screen name="+not-found" />
                  </Stack>
                  <FloatingPlayer />
                </BottomSheetModalProvider>
              </GestureHandlerRootView>
            </ToastProvider>
          </OverlayProvider>
          <StatusBar style="dark" />
        </ThemeProvider>
      </GluestackUIProvider>
      {__DEV__ && <DevToolsBubble />}
    </QueryClientProvider>
  );
}
