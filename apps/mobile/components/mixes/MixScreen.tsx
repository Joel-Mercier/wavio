import { LegendList } from "@legendapp/list/react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import GeneratedTrackListActions from "@/components/tracks/GeneratedTrackListActions";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { type MixKind, useMix } from "@/hooks/useMix";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { Child } from "@/services/openSubsonic/types";
import type { QueueSource } from "@/stores/queue";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { randomSeed } from "@/utils/shuffle";

const FEATURED_SHOWN = 3;
// Stable while loading, so useTrackListPress doesn't republish the selection
// pool on every render.
const NO_TRACKS: Child[] = [];

export default function MixScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];

  const params = useLocalSearchParams<{
    kind: string;
    id: string;
    name?: string;
    mbid?: string;
  }>();
  const kind: MixKind = params.kind === "artist" ? "artist" : "genre";
  const name = params.name || params.id;
  const title = t("app.mixes.title", { name });

  const [seed, setSeed] = useState(randomSeed);
  const { data, isLoading, isFetching, isPaused, error } = useMix({
    kind,
    id: params.id,
    name,
    musicBrainzId: params.mbid,
    seed,
  });
  const tracks = data?.tracks ?? NO_TRACKS;

  const source = useMemo<QueueSource>(
    () => ({ type: "mix", name: title }),
    [title],
  );
  const handleTrackPress = useTrackListPress(tracks, source);

  const featured = data?.featuredArtists.slice(0, FEATURED_SHOWN) ?? [];
  const isUnresolvedOffline = isPaused && !data;
  const emptyMessage = error
    ? t("app.mixes.error")
    : isUnresolvedOffline
      ? t("app.mixes.offline")
      : t("app.mixes.empty");

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
          {title}
        </Heading>
        <FadeOutScaleDown
          onPress={() => setSeed(randomSeed())}
          disabled={isFetching}
          testID="mix-regenerate"
        >
          <RefreshCw size={22} color={white} />
        </FadeOutScaleDown>
      </HStack>

      <LegendList
        recycleItems
        data={isLoading ? loadingData(8) : tracks}
        keyExtractor={(item, index) =>
          isLoading ? `skeleton-${index}` : item.id
        }
        renderItem={({ item, index }) =>
          isLoading ? (
            <TrackListItemSkeleton index={index} className="px-6" />
          ) : (
            <TrackListItem
              track={item}
              index={index}
              onPress={handleTrackPress}
              showCoverArt
              className="px-6"
            />
          )
        }
        ListHeaderComponent={
          <VStack className="pb-2 gap-y-3">
            <VStack className="gap-y-1 px-6">
              <Text className="text-primary-100" numberOfLines={1}>
                {t("app.shared.songCount", { count: tracks.length })}
              </Text>
              {featured.length > 0 && (
                <Text className="text-primary-100 text-sm" numberOfLines={2}>
                  {t("app.mixes.featuring", { names: featured.join(", ") })}
                </Text>
              )}
            </VStack>
            {!isUnresolvedOffline && (
              <GeneratedTrackListActions
                tracks={tracks}
                source={source}
                saveTarget="backend"
                defaultPlaylistName={title}
                queuedMessage={(count) => t("app.mixes.queued", { count })}
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
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}
