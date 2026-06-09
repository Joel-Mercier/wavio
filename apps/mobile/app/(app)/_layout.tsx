import { persistQueryClientRestore } from "@tanstack/react-query-persist-client";
import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import FloatingPlayer from "@/components/FloatingPlayer";
import OfflineStarredAutoSync from "@/components/OfflineStarredAutoSync";
import ServerExtensionsSync from "@/components/ServerExtensionsSync";
import {
  persistOptions,
  queryClient,
  setCacheRestoring,
} from "@/config/queryClient";
import { getAuthScope } from "@/config/storage";
import useJellyfinDefaultLibrary from "@/hooks/useJellyfinDefaultLibrary";
import { probeServer, resetServerReachable } from "@/services/network";
import {
  flushPlayQueue,
  initPlayQueueSync,
  stopPlayQueueSync,
} from "@/services/playQueueSync";
import { loadResumePositions } from "@/services/resumePositions";
import useActivity from "@/stores/activity";
import useAuth, { useAuthBase } from "@/stores/auth";
import useLocalLibrary from "@/stores/localLibrary";
import useOffline from "@/stores/offline";
import usePlaylists from "@/stores/playlists";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import { useServerExtensionsBase } from "@/stores/serverExtensions";
import { logError } from "@/utils/log";

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
    if (__DEV__) console.log("[app] Hydrating scoped stores for scope", scope);
    if (isScopeChange) {
      stopPlayQueueSync();
      useRecentPlays.getState().__reset();
      useRecentSearches.getState().__reset();
      useActivity.getState().__reset();
      useQueue.getState().__reset();
      useOffline.getState().__reset();
      useLocalLibrary.getState().__reset();
      // Drop the previous server's advertised OpenSubsonic extensions; the
      // ServerExtensionsSync component repopulates them for the new server.
      useServerExtensionsBase.getState().reset();
      // Clear the previous server's reachability state so the new server starts
      // optimistic; the probe below confirms it.
      resetServerReachable();
    }

    // Restore the persisted React Query cache for this scope. On a server
    // switch, clear the in-memory cache first so the previous server's data is
    // never visible, then restore the new scope's blob (the persister's storage
    // adapter is scope-dynamic, so this reads `${scope}:wavio-rq-cache`).
    setCacheRestoring(true);
    void (async () => {
      try {
        if (isScopeChange) {
          await queryClient.cancelQueries();
          queryClient.clear();
        }
        await persistQueryClientRestore({ queryClient, ...persistOptions });
      } catch (error) {
        logError("[app] Failed to restore persisted query cache", error);
      } finally {
        setCacheRestoring(false);
      }
    })();
    useRecentPlays.persist.rehydrate();
    useRecentSearches.persist.rehydrate();
    usePlaylists.persist.rehydrate();
    useActivity.persist.rehydrate();
    useQueue.persist.rehydrate();
    useOffline.persist.rehydrate();
    useLocalLibrary.persist.rehydrate();

    // Once the local queue is in place, start server play-queue sync (which may
    // restore the server's queue when prioritised) and prime resume positions.
    useQueue.persist.onFinishHydration(() => {
      void initPlayQueueSync();
      void loadResumePositions();
    });

    // Confirm the active server is reachable (covers cold start and server
    // switch); NetInfo's optimistic default would otherwise leave us "online".
    void probeServer();
  }, [isAuthenticated]);

  // Persist the play queue to the server promptly when leaving the app.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onChange = (status: AppStateStatus) => {
      if (status === "background" || status === "inactive") flushPlayQueue();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [isAuthenticated]);

  // Tear down sync subscriptions on sign-out so a fresh login re-initialises.
  useEffect(() => {
    if (isAuthenticated) return;
    stopPlayQueueSync();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    if (__DEV__)
      console.log("[app] User is not authenticated, redirecting to login");
    return <Redirect href="/(auth)/login" />;
  }

  if (__DEV__)
    console.log("[app] User is authenticated, rendering (app) layout");
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="playlists/new" />
        <Stack.Screen name="playlists/new-smart" />
        <Stack.Screen name="playlists/[id]/edit-rules" />
        <Stack.Screen name="internet-radio-stations/new" />
        <Stack.Screen name="podcast-channels/new" />
        {__DEV__ ? <Stack.Screen name="dev-metadata" /> : null}
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
      <ServerExtensionsSync />
    </>
  );
}
