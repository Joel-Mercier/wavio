import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import "@/global.css";
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
import CarAutoSync from "@/components/CarAutoSync";
import OfflineBanner from "@/components/OfflineBanner";
import { PodcastEpisodeActionsProvider } from "@/components/podcasts/PodcastEpisodeActionsProvider";
import { TrackActionsProvider } from "@/components/tracks/TrackActionsProvider";
import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "react-native-reanimated";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import NetInfo from "@react-native-community/netinfo";
import { init as sentryInit, wrap as sentryWrap } from "@sentry/react-native";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { getLocales } from "expo-localization";
import * as NavigationBar from "expo-navigation-bar";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { DevToolsBubble } from "react-native-react-query-devtools";
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated";
import i18n, {
  applyZodLocale,
  SupportedLanguages,
  type TSupportedLanguages,
} from "@/config/i18n";
import { initConnectionType } from "@/services/network";
import { configurePlayback } from "@/services/player";
import { initWidget } from "@/services/widget";
import useApp from "@/stores/app";

sentryInit({
  dsn: "https://fdd67c7590ff4b680308d9dae6640460@o4511401546285056.ingest.de.sentry.io/4511401549758544",

  enabled: !__DEV__ && process.env.EXPO_PUBLIC_ENV === "production",
  environment: process.env.EXPO_PUBLIC_ENV ?? "development",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
  if (Platform.OS === "android" && status === "active") {
    NavigationBar.setStyle("dark");
  }
}

export default sentryWrap(function RootLayout() {
  const locale = useApp((store) => store.locale);
  const setLocale = useApp((store) => store.setLocale);
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_300Light,
    Inter_700Bold,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    configureReanimatedLogger({
      level: ReanimatedLogLevel.warn,
      strict: false, // Reanimated runs in strict mode by default
    });
    onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state) => {
        setOnline(!!state.isConnected);
      }),
    );
    const unsubscribeConnectionType = initConnectionType();
    if (Platform.OS === "android") {
      NavigationBar.setStyle("dark");
    }
    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(() => {
            configurePlayback();
            initWidget(queryClient);
          })
        : (setTimeout(() => {
            configurePlayback();
            initWidget(queryClient);
          }, 0) as unknown as number);
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idle);
      } else {
        clearTimeout(idle);
      }
      subscription.remove();
      unsubscribeConnectionType();
    };
  }, []);

  useEffect(() => {
    if (locale) {
      i18n.changeLanguage(locale);
      applyZodLocale(locale);
      return;
    }
    const userLocales = getLocales();
    const matching = userLocales.find(
      (userLocale) =>
        userLocale.languageCode &&
        (SupportedLanguages as string[]).includes(userLocale.languageCode),
    );
    const next = (matching?.languageCode ?? "en") as TSupportedLanguages;
    setLocale(next);
    i18n.changeLanguage(next);
    applyZodLocale(next);
  }, [locale, setLocale]);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <KeyboardProvider>
        <GluestackUIProvider mode="dark">
          <ThemeProvider value={DarkTheme}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <StatusBar style="light" />
              <BottomSheetModalProvider>
                <TrackActionsProvider>
                  <PodcastEpisodeActionsProvider>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                      }}
                    >
                      <Stack.Screen name="(app)" />
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="+not-found" />
                    </Stack>
                    <OfflineBanner />
                    <CarAutoSync />
                  </PodcastEpisodeActionsProvider>
                </TrackActionsProvider>
              </BottomSheetModalProvider>
            </GestureHandlerRootView>
          </ThemeProvider>
        </GluestackUIProvider>
        {/* {__DEV__ && <DevToolsBubble />} */}
      </KeyboardProvider>
    </QueryClientProvider>
  );
});
