import { persistQueryClientRestore } from "@tanstack/react-query-persist-client";
import { Redirect, Stack } from "expo-router";
import { type ReactNode, useCallback, useEffect } from "react";
import {
  AppState,
  type AppStateStatus,
  useWindowDimensions,
} from "react-native";
import { Drawer } from "react-native-drawer-layout";
import { useCSSVariable } from "uniwind";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import DrawerMenu from "@/components/DrawerMenu";
import FloatingPlayer from "@/components/FloatingPlayer";
import LibrarySyncController from "@/components/LibrarySyncController";
import LocalLibraryIndexing from "@/components/local/LocalLibraryIndexing";
import OfflineMutationsSync from "@/components/OfflineMutationsSync";
import OfflineStarredAutoSync from "@/components/OfflineStarredAutoSync";
import JukeboxResumeDialog from "@/components/player/JukeboxResumeDialog";
import JukeboxSheet from "@/components/player/JukeboxSheet";
import ServerExtensionsSync from "@/components/ServerExtensionsSync";
import {
  persistOptions,
  queryClient,
  setCacheRestoring,
} from "@/config/queryClient";
import useMusicFolderSelection from "@/hooks/useMusicFolderSelection";
import { initJukeboxOnLaunch } from "@/services/jukebox";
import { probeServer, resetServerReachable } from "@/services/network";
import { librarySyncService } from "@/services/offline";
import {
  initOfflineMutationReplay,
  resetOfflineMutationReplay,
  stopOfflineMutationReplay,
} from "@/services/offlineMutations/replay";
import { resetPlayerForScopeChange } from "@/services/player";
import {
  flushPlayQueue,
  initPlayQueueSync,
  stopPlayQueueSync,
} from "@/services/playQueueSync";
import { loadResumePositions } from "@/services/resumePositions";
import { rewriteQueueRoutes } from "@/services/routeSwap";
import useActivity from "@/stores/activity";
import useApp from "@/stores/app";
import useAuth, { currentAuthScope, useAuthBase } from "@/stores/auth";
import useBookmarks from "@/stores/bookmarks";
import useCapabilityOverrides from "@/stores/capabilityOverrides";
import useLibrarySync from "@/stores/librarySync";
import useLocalLibrary from "@/stores/localLibrary";
import useOffline from "@/stores/offline";
import useOfflineMutations from "@/stores/offlineMutations";
import usePlaylists from "@/stores/playlists";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import { useServerExtensionsBase } from "@/stores/serverExtensions";
import { logError } from "@/utils/log";

// Module-level so it survives AppLayout unmount/remount during the
// logout → login flow used by switchToServer.
let lastHydratedScope: string | null = null;

// Isolates the drawer's open-state subscription so toggling it re-renders only
// this wrapper — not AppLayout, whose re-render would recreate the whole Stack
// navigator config and flicker the screen. `children` (the Stack subtree) stays
// referentially stable, so it's skipped on open/close.
function AppDrawer({ children }: { children: ReactNode }) {
  const showDrawer = useApp((s) => s.showDrawer);
  const setShowDrawer = useApp((s) => s.setShowDrawer);
  const isWideLayout = useApp((s) => s.isWideLayout);
  const { width } = useWindowDimensions();
  const primary600 = useCSSVariable("--color-primary-600") as
    | string
    | undefined;
  const openDrawer = useCallback(() => setShowDrawer(true), [setShowDrawer]);
  const closeDrawer = useCallback(() => setShowDrawer(false), [setShowDrawer]);
  const renderDrawerContent = useCallback(
    () => <DrawerMenu onClose={closeDrawer} />,
    [closeDrawer],
  );
  return (
    <Drawer
      open={showDrawer}
      onOpen={openDrawer}
      onClose={closeDrawer}
      drawerPosition="left"
      drawerType="front"
      drawerStyle={{
        backgroundColor: primary600,
        // The lg drawer was 3/4 of the screen — far too wide in landscape;
        // roughly halve it there.
        width: isWideLayout ? width * 0.4 : "75%",
      }}
      renderDrawerContent={renderDrawerContent}
    >
      {children}
    </Drawer>
  );
}

export default function AppLayout() {
  const isAuthenticated = useAuth((store) => store.isAuthenticated);
  const serverType = useAuthBase((s) => s.serverType);
  const localLibReady = useLocalLibrary((s) => s.ready);
  const lastScanAt = useLocalLibrary((s) => s.lastScanAt);
  useMusicFolderSelection();

  useEffect(() => {
    if (!isAuthenticated) return;
    const scope = currentAuthScope();
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
      // Mirror cold-start hydration on the player so the new scope's restored
      // queue loads silently instead of auto-playing. Must run after the queue
      // __reset above (so the store reports not-hydrated) and before the
      // rehydrate below.
      resetPlayerForScopeChange();
      useOffline.getState().__reset();
      librarySyncService.reset();
      useLibrarySync.getState().__reset();
      resetOfflineMutationReplay();
      useOfflineMutations.getState().__reset();
      useLocalLibrary.getState().__reset();
      useBookmarks.getState().__reset();
      useCapabilityOverrides.getState().__reset();
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
    // The queue bakes absolute URLs, and the session may have cold-started on a
    // different route than the one it was saved under (the active route is
    // persisted). Rehydration is synchronous, so this sees the restored queue.
    rewriteQueueRoutes();
    useOffline.persist.rehydrate();
    useLibrarySync.persist.rehydrate();
    useBookmarks.persist.rehydrate();
    useCapabilityOverrides.persist.rehydrate();
    useOfflineMutations.persist.onFinishHydration(() => {
      initOfflineMutationReplay();
    });
    useOfflineMutations.persist.rehydrate();
    // Flag the local-library store ready once its saved scan summary is back, so
    // the first-login indexing gate below can trust `lastScanAt`.
    void Promise.resolve(useLocalLibrary.persist.rehydrate()).then(() => {
      useLocalLibrary.getState().setReady();
    });

    // Once the local queue is in place, start server play-queue sync (which may
    // restore the server's queue when prioritised) and prime resume positions.
    useQueue.persist.onFinishHydration(() => {
      void initPlayQueueSync();
      void loadResumePositions();
      // If a jukebox session was playing when the app was last closed, re-check
      // the server and prompt the user to resume control.
      void initJukeboxOnLaunch();
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
    stopOfflineMutationReplay();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    if (__DEV__)
      console.log("[app] User is not authenticated, redirecting to login");
    return <Redirect href="/(auth)/login" />;
  }

  // First login into a local library: hold on the indexing screen (spinner +
  // live scan steps) until the on-device index is built, then fall through to
  // render the app — which lands on Home. `!localLibReady` covers the brief
  // window before the saved scan summary has rehydrated, so Home never flashes.
  if (serverType === "local" && (!localLibReady || lastScanAt === undefined)) {
    return <LocalLibraryIndexing />;
  }

  if (__DEV__)
    console.log("[app] User is authenticated, rendering (app) layout");
  return (
    <>
      <AppDrawer>
        <AppErrorBoundary variant="inline">
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="playlists/new" />
            <Stack.Screen name="playlists/new-smart" />
            <Stack.Screen name="playlists/[id]/edit-rules" />
            <Stack.Screen name="internet-radio-stations/new" />
            <Stack.Screen name="podcast-channels/new" />
            <Stack.Screen
              name="player"
              options={{
                gestureEnabled: true,
                fullScreenGestureEnabled: true,
                gestureDirection: "vertical",
                animationDuration: 300,
                animation: "fade_from_bottom",
                presentation: "formSheet",
                sheetAllowedDetents: [1.0],
                // Android: extend the sheet behind the top inset so the [1.0]
                // detent truly covers the screen (no underlying view peeking at
                // the top) and the screen's own paddingTop: insets.top isn't
                // stacked on top of a second inset gap.
                sheetShouldOverflowTopInset: true,
              }}
            />
            <Stack.Screen
              name="lyrics"
              options={{
                gestureEnabled: true,
                fullScreenGestureEnabled: true,
                gestureDirection: "vertical",
                animationDuration: 300,
                animation: "fade_from_bottom",
                presentation: "formSheet",
                sheetAllowedDetents: [1.0],
                sheetShouldOverflowTopInset: true,
              }}
            />
          </Stack>
        </AppErrorBoundary>
        <FloatingPlayer />
      </AppDrawer>
      <OfflineMutationsSync />
      <OfflineStarredAutoSync />
      <LibrarySyncController />
      <ServerExtensionsSync />
      <JukeboxResumeDialog />
      <JukeboxSheet />
    </>
  );
}
