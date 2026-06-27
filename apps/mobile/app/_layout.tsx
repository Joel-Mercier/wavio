import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import "@/global.css";
import "@/config/http";
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { NavigationBar } from "expo-navigation-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

import { useEffect, useRef } from "react";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import CarAutoSync from "@/components/CarAutoSync";
import { PodcastEpisodeActionsProvider } from "@/components/podcasts/PodcastEpisodeActionsProvider";
import { TrackActionsProvider } from "@/components/tracks/TrackActionsProvider";
import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "react-native-reanimated";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { init as sentryInit, wrap as sentryWrap } from "@sentry/react-native";
import {
  focusManager,
  onlineManager,
  QueryClientProvider,
} from "@tanstack/react-query";
import { persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import * as Application from "expo-application";
import { getLocales } from "expo-localization";
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
import { persistOptions, queryClient } from "@/config/queryClient";
import { scrubBreadcrumb, scrubEvent } from "@/services/errorReporting";
import {
  getIsEffectivelyOnline,
  initConnectionType,
  probeServer,
  subscribeEffectiveOnline,
} from "@/services/network";
import { initOrientation } from "@/services/orientation";
import { configurePlayback } from "@/services/player";
import { initSentryScope } from "@/services/sentryScope";
import { initSslTrust, refreshSslProxyOnForeground } from "@/services/sslTrust";
import { initWidget } from "@/services/widget";
import useApp from "@/stores/app";
import { useAuthBase } from "@/stores/auth";

sentryInit({
  dsn: "https://fdd67c7590ff4b680308d9dae6640460@o4511401546285056.ingest.de.sentry.io/4511401549758544",

  // Report from every non-dev build — preview and production — so issues are
  // caught during QA, not only after release. Tagged by `environment` so the
  // two can be filtered apart in Sentry.
  enabled: !__DEV__ && process.env.EXPO_PUBLIC_ENV !== "development",
  environment: process.env.EXPO_PUBLIC_ENV ?? "development",

  // Tie events to the shipped binary so uploaded source maps / dSYMs resolve
  // stack traces back to readable source.
  release: `wavio@${Application.nativeApplicationVersion ?? "0.0.0"}`,
  dist: Application.nativeBuildVersion ?? undefined,

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable structured logs (Sentry.logger.*) for diagnostic, non-Issue state.
  enableLogs: true,

  // Strip credentials Subsonic/Jellyfin/Taddy carry in request URLs and auth
  // headers before any breadcrumb or event leaves the device (sendDefaultPii
  // is on, so without this the password in the Subsonic query string leaks).
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  beforeSend: (event) => scrubEvent(event),

  // Backstop to the reportError classifier: never raise an Issue for transient
  // connectivity failures.
  ignoreErrors: [
    "Network Error",
    "timeout exceeded",
    "Request aborted",
    "AbortError",
    /ECONNABORTED/,
    /ERR_NETWORK/,
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
  if (status === "active") {
    // Re-check server reachability on foreground: the network (and thus the
    // server's reachability) may have changed while backgrounded.
    void probeServer();
    // The iOS loopback proxy may have been torn down while backgrounded; make
    // sure the cached proxy info is current before streaming resumes.
    void refreshSslProxyOnForeground();
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
    // Install the custom SSL trust manager before any network request so
    // already-trusted self-signed servers connect on cold start (Android is
    // global; iOS also (re)starts the loopback proxy for trusted upstreams).
    void initSslTrust();
    // Drive React Query's online state off effective connectivity (device
    // online AND server reachable) so it pauses refetches and serves cache when
    // the server is unreachable, instead of hammering it with failing requests.
    onlineManager.setEventListener((setOnline) => {
      setOnline(getIsEffectivelyOnline());
      return subscribeEffectiveOnline(() =>
        setOnline(getIsEffectivelyOnline()),
      );
    });
    // Continuously persist the query cache to the active (server, user) scope.
    // The initial restore happens in app/(app)/_layout.tsx's scope-change
    // effect, which can also re-restore when switching servers in-app.
    const unsubscribePersist = persistQueryClientSubscribe({
      queryClient,
      ...persistOptions,
    });
    const unsubscribeConnectionType = initConnectionType();
    const unsubscribeSentryScope = initSentryScope();
    const unsubscribeOrientation = initOrientation();
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
      unsubscribeSentryScope();
      unsubscribeOrientation();
      unsubscribePersist();
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

  // Local-library display labels (e.g. "Unknown album") are localized at map
  // time and cached by React Query, so a runtime locale switch wouldn't update
  // them until the cache goes stale. Re-run the local queries on an actual
  // change so the new locale shows immediately. Skips the initial mount and only
  // touches local mode (remote names come from the server, not from i18n).
  const prevLocale = useRef(locale);
  useEffect(() => {
    if (prevLocale.current === locale) return;
    prevLocale.current = locale;
    if (useAuthBase.getState().serverType === "local") {
      queryClient.invalidateQueries();
    }
  }, [locale]);

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
              <NavigationBar style="light" />
              <BottomSheetModalProvider>
                <TrackActionsProvider>
                  <PodcastEpisodeActionsProvider>
                    <AppErrorBoundary variant="fullscreen">
                      <Stack
                        screenOptions={{
                          headerShown: false,
                        }}
                      >
                        <Stack.Screen name="(app)" />
                        <Stack.Screen name="(auth)" />
                        <Stack.Screen name="+not-found" />
                      </Stack>
                    </AppErrorBoundary>
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
