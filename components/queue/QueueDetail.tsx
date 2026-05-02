import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Child } from "@/services/openSubsonic/types";
import useQueue, { type QueueTrack } from "@/stores/queue";

const queueTrackToChild = (track: QueueTrack): Child =>
  ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artistId: track.artistId,
    albumId: track.albumId,
    coverArt: track.coverArt,
    duration: track.duration,
    starred: track.starred,
    musicBrainzId: track.musicBrainzId,
    genre: track.genre,
    contentType: track.contentType,
  }) as Child;

export default function QueueDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const queue = useQueue((state) => state.queue);

  const tracks = queue.map(queueTrackToChild);

  return (
    <Box className="h-full">
      <Box className="px-6 mt-6 pb-6 flex-1">
        <HStack
          className="items-center mb-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white text-center truncate flex-1" size="lg">
            {t("app.queue.title")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        {tracks.length === 0 ? (
          <VStack className="flex-1 items-center justify-center">
            <Text className="text-primary-100 text-center">
              {t("app.queue.empty")}
            </Text>
          </VStack>
        ) : (
          <FlashList
            data={tracks}
            keyExtractor={(item, index) => `${item.id}:${index}`}
            estimatedItemSize={72}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom:
                insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
            }}
            renderItem={({ item, index }) => (
              <TrackListItem track={item} index={index} trackList={tracks} />
            )}
          />
        )}
      </Box>
    </Box>
  );
}
