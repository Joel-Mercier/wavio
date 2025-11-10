import FloatingPlayer from "@/components/FloatingPlayer";
import useAuth from "@/stores/auth";
import usePlaylists from "@/stores/playlists";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";

export default function AppLayout() {
  const isAuthenticated = useAuth((store) => store.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      console.log("[app] User is authenticated, rehydrating scoped stores");
      useRecentPlays.persist.rehydrate();
      useRecentSearches.persist.rehydrate();
      usePlaylists.persist.rehydrate();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    console.log("[app] User is not authenticated, redirecting to login");
    return <Redirect href="/(auth)/login" />;
  }

  console.log("[app] User is authenticated, rendering (app) layout");
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="playlists/new" />
        <Stack.Screen name="internet-radio-stations/new" />
        <Stack.Screen
          name="player"
          options={{
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            gestureDirection: "vertical",
            animationDuration: 300,
            animation: "fade_from_bottom",
            presentation: "formSheet",
          }}
        />
      </Stack>
      <FloatingPlayer />
    </>
  );
}
