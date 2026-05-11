import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import "@/global.css";
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import CarAutoSync from "@/components/CarAutoSync";
import OfflineBanner from "@/components/OfflineBanner";
import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "react-native-reanimated";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import NetInfo from "@react-native-community/netinfo";
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
import * as z from "zod";
import i18n, {
  SupportedLanguages,
  type TSupportedLanguages,
} from "@/config/i18n";
import { configurePlayback } from "@/services/player";
import useApp from "@/stores/app";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

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
  if (Platform.OS === "android" && status === "active") {
    NavigationBar.setStyle("dark");
  }
}

export default function RootLayout() {
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
    configurePlayback();
    if (Platform.OS === "android") {
      NavigationBar.setStyle("dark");
    }
  }, []);

  useEffect(() => {
    if (locale) {
      i18n.changeLanguage(locale);
      z.config(z.locales[locale]());
    } else {
      const userLocales = getLocales();
      if (
        userLocales.some(
          (userLocale) =>
            userLocale.languageCode &&
            (SupportedLanguages as string[]).includes(userLocale.languageCode),
        )
      ) {
        const firstMatchingLocale = userLocales.filter(
          (userLocale) =>
            userLocale.languageCode &&
            (SupportedLanguages as string[]).includes(userLocale.languageCode),
        )[0].languageCode as TSupportedLanguages;
        setLocale(firstMatchingLocale);
        i18n.changeLanguage(firstMatchingLocale);
        z.config(z.locales[firstMatchingLocale]());
      } else {
        setLocale("en");
        i18n.changeLanguage("en");
        z.config(z.locales.en());
      }
    }
    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => subscription.remove();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <KeyboardProvider>
        <GluestackUIProvider mode="dark">
          <ThemeProvider value={DarkTheme}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <BottomSheetModalProvider>
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
              </BottomSheetModalProvider>
            </GestureHandlerRootView>
          </ThemeProvider>
        </GluestackUIProvider>
        {/* {__DEV__ && <DevToolsBubble />} */}
      </KeyboardProvider>
    </QueryClientProvider>
  );
}
