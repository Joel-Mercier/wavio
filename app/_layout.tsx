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
import FloatingPlayer from "@/components/FloatingPlayer";
import i18n, {
  SupportedLanguages,
  type TSupportedLanguages,
} from "@/config/i18n";
import useApp from "@/stores/app";
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
import { getLocales } from "expo-localization";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { DevToolsBubble } from "react-native-react-query-devtools";
import {
  ReanimatedLogLevel,
  configureReanimatedLogger,
} from "react-native-reanimated";
import { z } from "zod";

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
}

export default function RootLayout() {
  const locale = useApp.use.locale();
  const setLocale = useApp.use.setLocale();
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
                        headerShown: false,
                      }}
                    >
                      <Stack.Screen name="(app)" />
                      <Stack.Screen name="(auth)" />
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
      </KeyboardProvider>
    </QueryClientProvider>
  );
}
