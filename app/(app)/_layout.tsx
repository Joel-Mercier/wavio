import FloatingPlayer from "@/components/FloatingPlayer";
import useAuth from "@/stores/auth";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";

export default function AppLayout() {
  const isAuthenticated = useAuth.use.isAuthenticated();
  console.log("isAuthenticated", isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      useRecentPlays.persist.rehydrate();
      useRecentSearches.persist.rehydrate();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

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
