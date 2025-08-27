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
import { useEffect } from "react";
import { SystemBars } from "react-native-edge-to-edge";
import "react-native-reanimated";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FloatingPlayer from "@/components/FloatingPlayer";
import { storage } from "@/config/storage";
import { themeConfig } from "@/config/theme";
import { useLogTrackPlayerState } from "@/hooks/useLogTrackPlayerState";
import { useSetupTrackPlayer } from "@/hooks/useSetupTrackPlayer";
import PlaybackService from "@/services/playbackService";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
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
import { ArrowLeft, X } from "lucide-react-native";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DevToolsBubble } from "react-native-react-query-devtools";
import {
  ReanimatedLogLevel,
  configureReanimatedLogger,
} from "react-native-reanimated";
import TrackPlayer from "react-native-track-player";

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
  const hasSetupPlayer = useSetupTrackPlayer();
  useLogTrackPlayerState();

  // const hasSetupPlayer = true;
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_300Light,
    Inter_700Bold,
  });

  useEffect(() => {
    if (loaded && hasSetupPlayer) {
      SplashScreen.hideAsync();
    }
  }, [loaded, hasSetupPlayer]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => subscription.remove();
  }, []);

  if (!loaded || !hasSetupPlayer) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GluestackUIProvider mode="light">
        <ThemeProvider value={DarkTheme}>
          <SystemBars
            style="light"
            hidden={{ statusBar: false, navigationBar: false }}
          />
          <OverlayProvider>
            <ToastProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <BottomSheetModalProvider>
                  <Stack
                    screenOptions={{
                      navigationBarColor: "#000",
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
                      name="playlists/new"
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="playlists/add-to-playlist"
                      options={({ navigation }) => ({
                        headerShown: true,
                        title: "Add to playlist",
                        headerTitleAlign: "center",
                        headerTitleStyle: {
                          fontSize: 16,
                          fontWeight: "bold",
                        },
                        headerLeft: () => (
                          <FadeOutScaleDown onPress={() => navigation.goBack()}>
                            <ArrowLeft
                              size={22}
                              color={themeConfig.theme.colors.white}
                            />
                          </FadeOutScaleDown>
                        ),
                      })}
                    />
                    <Stack.Screen
                      name="playlists/[id]/edit"
                      options={({ navigation }) => ({
                        headerShown: true,
                        title: "Edit playlist",
                        headerTitleAlign: "center",
                        headerTitleStyle: {
                          fontSize: 16,
                          fontWeight: "bold",
                        },
                        headerLeft: () => (
                          <FadeOutScaleDown onPress={() => navigation.goBack()}>
                            <X
                              size={22}
                              color={themeConfig.theme.colors.white}
                            />
                          </FadeOutScaleDown>
                        ),
                      })}
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
                      name="library/search"
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="recent-searches"
                      options={{
                        headerShown: false,
                      }}
                    />
                    <Stack.Screen
                      name="search-results"
                      options={{
                        headerShown: false,
                      }}
                    />
                    <Stack.Screen
                      name="settings"
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="shares"
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="player"
                      options={{
                        headerShown: false,
                        gestureEnabled: true,
                        fullScreenGestureEnabled: true,
                        gestureDirection: "vertical",
                        animationDuration: 300,
                        animation: "fade_from_bottom",
                        presentation: "formSheet",
                      }}
                    />
                    <Stack.Screen name="+not-found" />
                  </Stack>
                  <FloatingPlayer />
                </BottomSheetModalProvider>
              </GestureHandlerRootView>
            </ToastProvider>
          </OverlayProvider>
        </ThemeProvider>
      </GluestackUIProvider>
      {/* {__DEV__ && <DevToolsBubble />} */}
    </QueryClientProvider>
  );
}
