import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import FloatingPlayer from "@/components/FloatingPlayer";
import OfflineStarredAutoSync from "@/components/OfflineStarredAutoSync";
import { getAuthScope } from "@/config/storage";
import useJellyfinDefaultLibrary from "@/hooks/useJellyfinDefaultLibrary";
import useActivity from "@/stores/activity";
import useAuth, { useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";
import usePlaylists from "@/stores/playlists";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";

// Module-level so it survives AppLayout unmount/remount during the
// logout → login flow used by switchToServer.
let lastHydratedScope: string | null = null;

export default function AppLayout() {
  const isAuthenticated = useAuth((store) => store.isAuthenticated);
  useJellyfinDefaultLibrary();

  useEffect(() => {
    if (!isAuthenticated) return;
    const { url, username } = useAuthBase.getState();
    const scope = getAuthScope(url, username);
    if (lastHydratedScope === scope) return;
    // Only reset when switching to a different (server, user) scope. On the
    // initial hydration after app start the in-memory state is already the
    // initial defaults, and a reset here would race the async rehydrate and
    // wipe data that's about to be restored from storage.
    const isScopeChange = lastHydratedScope !== null;
    lastHydratedScope = scope;
    console.log("[app] Hydrating scoped stores for scope", scope);
    if (isScopeChange) {
      useRecentPlays.getState().__reset();
      useRecentSearches.getState().__reset();
      useActivity.getState().__reset();
      useQueue.getState().__reset();
      useOffline.getState().__reset();
    }
    useRecentPlays.persist.rehydrate();
    useRecentSearches.persist.rehydrate();
    usePlaylists.persist.rehydrate();
    useActivity.persist.rehydrate();
    useQueue.persist.rehydrate();
    useOffline.persist.rehydrate();
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
        <Stack.Screen name="playlists/new-smart" />
        <Stack.Screen name="playlists/[id]/edit-rules" />
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
      <OfflineStarredAutoSync />
    </>
  );
}
