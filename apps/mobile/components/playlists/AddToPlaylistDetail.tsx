import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import AddToPlaylistListItem from "@/components/playlists/AddToPlaylistListItem";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { usePlaylists, useUpdatePlaylist } from "@/hooks/backend/usePlaylists";
import { getPlaylist } from "@/services/backend/playlists";
import type { Playlist } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import usePlaylistTargets from "@/stores/playlistTargets";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";
import { TOAST_DURATION } from "@/utils/toastDuration";

// The list is a flat union so the "Recent" and "All playlists" captions scroll
// with it, the way the queue screen groups its sections.
type Row =
  | { kind: "header"; key: string; label: string }
  | { kind: "playlist"; key: string; playlist: Playlist };

export default function AddToPlaylistDetail() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { ids } = useLocalSearchParams<{ ids: string }>();
  // Every read below assumes an array; the screen is only ever reached with
  // `ids`, but a malformed deep link must not crash it.
  const trackIds = useMemo(() => ids?.split(",") ?? [], [ids]);
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
  const [playlistTrackIds, setPlaylistTrackIds] = useState<
    Record<string, string[]>
  >({});
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const submittingRef = useRef(false);
  const [duplicatePlaylistNames, setDuplicatePlaylistNames] = useState<
    string[]
  >([]);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const recentTargets = usePlaylistTargets((state) => state.recentTargets);
  const { data, isLoading, error } = usePlaylists({});
  const doUpdatePlaylist = useUpdatePlaylist();

  const handleNewPlaylistPress = () => {
    router.navigate({
      pathname: "/playlists/new",
      params: { returnTo: "add-to-playlist" },
    });
  };

  // react-query drops the `mutate(vars, { onSuccess })` callbacks once the
  // observer has no listeners left; `mutateAsync` has no such guard, so this
  // screen has to know for itself whether it is still up before navigating.
  // Without it, backing out while the adds are in flight pops the screen
  // underneath this one when they resolve.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const addToSelectedPlaylists = async () => {
    // The button below stays mounted while the adds are in flight, and one tap
    // fires one mutation per selected playlist. Without a guard a user who taps
    // again — which they do, because nothing on screen changes until the last
    // one resolves — multiplies the whole batch. A ref, not `isPending`: taps
    // land faster than a re-render, so a state flag lets the first few through.
    if (submittingRef.current) return;
    submittingRef.current = true;
    const targets = selectedPlaylists;
    const results = await Promise.allSettled(
      targets.map((playlistId) =>
        doUpdatePlaylist.mutateAsync({
          id: playlistId,
          songIdToAdd: trackIds,
        }),
      ),
    );
    const added: string[] = [];
    const failed: string[] = [];
    targets.forEach((playlistId, index) => {
      const result = results[index];
      if (result.status === "fulfilled") {
        added.push(playlistId);
      } else {
        failed.push(playlistId);
        logError(result.reason);
      }
    });

    if (added.length > 0) {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "playlist" &&
          added.includes(query.queryKey[1] as string),
      });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      // Remembered for this session only, so the next track's actions sheet can
      // offer a one-tap add and this screen can float these to the top.
      usePlaylistTargets.getState().recordTargets(
        added.map((playlistId) => ({
          id: playlistId,
          name: playlistById.get(playlistId)?.name ?? "",
        })),
      );
    }

    if (!mountedRef.current) return;

    if (failed.length > 0) {
      // Stay put with only the failures still ticked, so the obvious retry
      // hits them alone: navigating away on a partial success reads as a total
      // failure and the retry would re-add the tracks to the playlists that
      // already took them. Released only once the server has answered, so a
      // refused add (a Jellyfin playlist this user may not edit answers 403)
      // can be retried without re-arming the tap storm above.
      submittingRef.current = false;
      setSelectedPlaylists(failed);
      const failedNames = failed
        .map((playlistId) => playlistById.get(playlistId)?.name ?? "")
        .filter((name) => name.length > 0);
      toast.show({
        placement: "top",
        duration: TOAST_DURATION.default,
        render: () => (
          <Toast action="error">
            <ToastDescription>
              {added.length > 0 && failedNames.length > 0
                ? t("app.playlists.addTrackPartialErrorMessage", {
                    count: trackIds.length,
                    playlists: failedNames.join(", "),
                  })
                : t("app.playlists.addTrackErrorMessage", {
                    count: trackIds.length,
                  })}
            </ToastDescription>
          </Toast>
        ),
      });
      return;
    }

    // Once, after the whole batch settles: firing these per mutation stacked a
    // toast and a back navigation per selected playlist.
    goBackOrHome(router);
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.default,
      render: () => (
        <Toast action="success">
          <ToastDescription>
            {t("app.playlists.addTrackSuccessMessage", {
              count: trackIds.length,
            })}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handlePlaylistUpdatePress = () => {
    if (selectedPlaylists.length === 0) {
      goBackOrHome(router);
      return;
    }
    const duplicateNames = selectedPlaylists
      .filter((playlistId) =>
        trackIds.some((trackId) =>
          playlistTrackIds[playlistId]?.includes(trackId),
        ),
      )
      .map((playlistId) => playlistById.get(playlistId)?.name ?? "")
      .filter((name) => name.length > 0);

    if (duplicateNames.length === 0) {
      void addToSelectedPlaylists();
    } else {
      setDuplicatePlaylistNames(duplicateNames);
      setShowDuplicateDialog(true);
    }
  };

  const handleCloseDuplicateDialog = () => {
    setShowDuplicateDialog(false);
  };

  const handleConfirmAddDuplicates = () => {
    setShowDuplicateDialog(false);
    void addToSelectedPlaylists();
  };

  const handlePlaylistPress = (id: string) => {
    if (selectedPlaylists.includes(id)) {
      setSelectedPlaylists(
        selectedPlaylists.filter((playlistId) => playlistId !== id),
      );
    } else {
      setSelectedPlaylists([...selectedPlaylists, id]);
      if (!playlistTrackIds[id]) {
        queryClient
          .fetchQuery({
            queryKey: ["playlist", id],
            queryFn: () => getPlaylist(id),
          })
          .then((playlistData) => {
            setPlaylistTrackIds((current) => ({
              ...current,
              [id]: playlistData.playlist.entry?.map((entry) => entry.id) ?? [],
            }));
          })
          .catch((error) => {
            logError(error);
            setPlaylistTrackIds((current) => ({ ...current, [id]: [] }));
          });
      }
    }
  };

  // In landscape the player docks into the left sidebar, so content on the right
  // needs no bottom clearance. Portrait: FloatingPlayer sits at bottom: 96 and is
  // FLOATING_PLAYER_HEIGHT tall,
  // so its top edge is this far from the bottom of the screen.
  const floatingPlayerTop = isWideLayout ? 0 : 96 + FLOATING_PLAYER_HEIGHT;

  const playlists = data?.playlists.playlist;
  const playlistById = useMemo(
    () => new Map((playlists ?? []).map((playlist) => [playlist.id, playlist])),
    [playlists],
  );

  // Playlists this session already added to, floated to the top — the same
  // handful of targets gets used over and over during a curation burst
  // (issue #195). Deliberately not pre-ticked: a mis-tap on "Finished" must
  // never write to a playlist the user did not choose.
  const rows = useMemo<Row[]>(() => {
    if (!playlists) return [];
    const recent = recentTargets
      .map((target) => playlistById.get(target.id))
      .filter((playlist): playlist is Playlist => !!playlist);
    if (recent.length === 0) {
      return playlists.map((playlist) => ({
        kind: "playlist",
        key: playlist.id,
        playlist,
      }));
    }
    const recentIds = new Set(recent.map((playlist) => playlist.id));
    return [
      {
        kind: "header",
        key: "header-recent",
        label: t("app.playlists.recentPlaylists"),
      },
      ...recent.map(
        (playlist) =>
          ({
            kind: "playlist",
            key: `recent-${playlist.id}`,
            playlist,
          }) as const,
      ),
      {
        kind: "header",
        key: "header-all",
        label: t("app.playlists.allPlaylists"),
      },
      ...playlists
        .filter((playlist) => !recentIds.has(playlist.id))
        .map(
          (playlist) =>
            ({
              kind: "playlist",
              key: playlist.id,
              playlist,
            }) as const,
        ),
    ];
  }, [playlists, playlistById, recentTargets, t]);

  return (
    <Box className="h-full flex-1">
      <Box className="px-6 pb-6">
        <HStack
          className="items-center justify-between"
          style={{ paddingTop: insets.top + 16 }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
              <X size={24} color={white} />
            </Box>
          </FadeOutScaleDown>
          <Heading
            className="text-white font-bold text-center truncate flex-1"
            size="lg"
          >
            {t("app.playlists.addToPlaylistTitle")}
          </Heading>
          <Box className="w-10" />
        </HStack>
      </Box>
      <FlashList
        data={rows}
        contentContainerStyle={{
          paddingBottom: floatingPlayerTop + 96,
        }}
        renderItem={({ item, extraData }) =>
          item.kind === "header" ? (
            <Heading size="sm" className="text-gray-300 px-6 mt-2 mb-3">
              {item.label}
            </Heading>
          ) : (
            <AddToPlaylistListItem
              playlist={item.playlist}
              selected={extraData.selectedPlaylists.includes(item.playlist.id)}
              onPress={handlePlaylistPress}
            />
          )
        }
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.kind}
        extraData={{ selectedPlaylists }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <VStack className="px-6">
            <Center className="my-6">
              <FadeOutScaleDown
                className="items-center justify-center py-3 px-8 border border-white bg-white rounded-full"
                onPress={handleNewPlaylistPress}
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.playlists.newPlaylist")}
                </Text>
              </FadeOutScaleDown>
            </Center>

            {isLoading && <Spinner size="large" />}
            {error && <ErrorDisplay error={error} />}
          </VStack>
        }
      />
      <LinearGradient
        pointerEvents="box-none"
        colors={["transparent", "#000000"]}
        locations={[0, 0.6]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: floatingPlayerTop + 160,
          justifyContent: "flex-end",
        }}
      >
        <Center style={{ marginBottom: floatingPlayerTop + 16 }}>
          <FadeOutScaleDown
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
            onPress={handlePlaylistUpdatePress}
            disabled={doUpdatePlaylist.isPending}
          >
            <Text className="text-primary-800 font-bold text-lg">
              {t("app.playlists.finished")}
            </Text>
          </FadeOutScaleDown>
        </Center>
      </LinearGradient>
      <AlertDialog
        isOpen={showDuplicateDialog}
        onClose={handleCloseDuplicateDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.playlists.duplicateTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.playlists.duplicateDescription", {
                count: trackIds.length,
                playlists: duplicatePlaylistNames.join(", "),
              })}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="flex-col items-stretch justify-center">
            <FadeOutScaleDown
              onPress={handleConfirmAddDuplicates}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full mb-3"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.playlists.addAnyway")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleCloseDuplicateDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
