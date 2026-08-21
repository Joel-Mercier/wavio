import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import GeneratedTrackListActions from "@/components/tracks/GeneratedTrackListActions";
import NotInLibraryTrackListItem from "@/components/tracks/NotInLibraryTrackListItem";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useLibraryResolvedTracks,
  useListenBrainzPlaylist,
} from "@/hooks/listenBrainz/useListenBrainzPlaylists";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { LibraryMatch } from "@/services/libraryMatch";
import type {
  CreatedForPatch,
  ListenBrainzPlaylistTrack,
} from "@/services/listenBrainz/types";
import type { QueueSource } from "@/stores/queue";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

const I18N_KEY: Record<CreatedForPatch, string> = {
  "daily-jams": "dailyJams",
  "weekly-jams": "weeklyJams",
  "weekly-exploration": "weeklyExploration",
};

const PREFIX = "app.settings.integrations.listenbrainz.createdForYou";

type Row = LibraryMatch<ListenBrainzPlaylistTrack>;

/**
 * One ListenBrainz-generated playlist, resolved against the library.
 *
 * This is where the expensive half of the feature lives: opening it fetches the
 * ~50-track JSPF and then runs ~60 backend searches to work out which of those
 * tracks the user actually holds. The home carousel deliberately does none of
 * that, so nothing here runs until a card is tapped.
 */
export default function ListenBrainzPlaylistScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const screenBottomPadding = useScreenBottomPadding();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const [refreshing, setRefreshing] = useState(false);

  const { mbid, patch } = useLocalSearchParams<{
    mbid: string;
    patch?: CreatedForPatch;
  }>();

  // `patch` is an unvalidated route param, and the heading is not only shown but
  // reused as the queue's "playing from" label and the saved playlist's default
  // name — so an unknown value has to fall back rather than name them after a
  // missing i18n key.
  const heading =
    patch && patch in I18N_KEY
      ? t(`${PREFIX}.${I18N_KEY[patch]}`)
      : t("app.home.createdForYou");

  const {
    data: tracks,
    isLoading: isLoadingPlaylist,
    error,
  } = useListenBrainzPlaylist(mbid);
  const {
    data: matches,
    isLoading: isResolving,
    isPaused,
  } = useLibraryResolvedTracks(mbid, tracks);

  // The FlashList index counts the missing rows too, but useTrackListPress
  // indexes into the matched-only array — so each matched row has to carry the
  // position it occupies *there*, not the one it occupies on screen. Without
  // this, tapping any track after a missing one plays the wrong song.
  const { libraryTracks, libraryIndexByKey } = useMemo(() => {
    const list = [];
    const byKey = new Map<string, number>();
    for (const match of matches ?? []) {
      if (match.state !== "matched") continue;
      byKey.set(match.external.key, list.length);
      list.push(match.track);
    }
    return { libraryTracks: list, libraryIndexByKey: byKey };
  }, [matches]);

  const missingCount = (matches?.length ?? 0) - libraryTracks.length;
  const isLoading = isLoadingPlaylist || isResolving;

  const source = useMemo<QueueSource>(
    () => ({ type: "listenbrainz", name: heading }),
    [heading],
  );
  const handleTrackPress = useTrackListPress(libraryTracks, source);

  // The affordance for "I just downloaded these, look again" — a resolve is the
  // only thing on this screen whose answer changes as the library grows.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        queryKey: ["listenbrainz", "resolve", mbid],
      });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, mbid]);

  const renderItem = useCallback(
    ({ item, index }: { item: Row; index: number }) => {
      if (item.state === "missing") {
        return (
          <NotInLibraryTrackListItem
            track={item.external}
            coverArtUrl={item.external.coverArtUrl}
            className="px-6"
          />
        );
      }
      return (
        <TrackListItem
          track={item.track}
          index={libraryIndexByKey.get(item.external.key) ?? index}
          onPress={handleTrackPress}
          showCoverArt
          className="px-6"
        />
      );
    },
    [handleTrackPress, libraryIndexByKey],
  );

  // Paused means the music server is unreachable, so the tracks can't be looked
  // up at all — distinct from "we looked and found none of them".
  const isUnresolvedOffline = isPaused && !matches;

  const emptyMessage = error
    ? t(`${PREFIX}.unavailable`)
    : isUnresolvedOffline
      ? t(`${PREFIX}.offline`)
      : t(`${PREFIX}.empty`);

  return (
    <Box className="h-full bg-primary-800">
      <HStack
        className="items-center gap-x-4 px-6 pb-4"
        style={{ paddingTop: insets.top + 16 }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color={white} />
        </FadeOutScaleDown>
        <Heading
          className="text-white font-bold text-center truncate flex-1 mx-2"
          size="lg"
          numberOfLines={1}
        >
          {heading}
        </Heading>
        {/* Balances the back arrow so the title centers on the screen, not on
            the space left over beside it. */}
        <Box className="w-6" />
      </HStack>

      <FlashList
        data={isLoading ? loadingData(8) : (matches ?? [])}
        keyExtractor={(item, index) =>
          isLoading ? `skeleton-${index}` : item.external.key
        }
        getItemType={(item) => (isLoading ? "skeleton" : item.state)}
        renderItem={
          isLoading
            ? ({ index }) => (
                <TrackListItemSkeleton index={index} className="px-6" />
              )
            : renderItem
        }
        ListHeaderComponent={
          <VStack className="pb-2 gap-y-3">
            <VStack className="gap-y-1 px-6">
              <Text className="text-primary-100" numberOfLines={1}>
                {t("app.shared.songCount", { count: libraryTracks.length })}
              </Text>
              {missingCount > 0 && (
                <Text className="text-primary-100 text-sm">
                  {t(`${PREFIX}.missing`, { count: missingCount })}
                </Text>
              )}
            </VStack>
            {!isUnresolvedOffline && (
              <GeneratedTrackListActions
                tracks={libraryTracks}
                source={source}
                // Never the AudioMuse writer: a user who set that preference
                // would otherwise get this playlist created by AudioMuse, under
                // a name with an "_instant" suffix they never asked for.
                saveTarget="backend"
                defaultPlaylistName={heading}
                queuedMessage={(count) => t(`${PREFIX}.queued`, { count })}
                footer={
                  missingCount > 0 && libraryTracks.length > 0 ? (
                    <Text className="text-primary-100 text-sm">
                      {t(`${PREFIX}.saveOnlyMatched`, {
                        count: libraryTracks.length,
                      })}
                    </Text>
                  ) : null
                }
              />
            )}
          </VStack>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <Text className="text-primary-100 text-center px-6 my-4">
              {emptyMessage}
            </Text>
          )
        }
        onRefresh={handleRefresh}
        refreshing={refreshing}
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}
