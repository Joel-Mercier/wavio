import { FlashList } from "@shopify/flash-list";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import LidarrAlbumRow from "@/components/downloaders/lidarr/LidarrAlbumRow";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { useArtistDiscography } from "@/hooks/lidarr/useArtistDiscography";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { deleteArtist, getArtistAlbums } from "@/services/lidarr";
import type { LidarrAlbum } from "@/services/lidarr/types";
import useLidarr from "@/stores/lidarr";
import { goBackOrHome } from "@/utils/navigation";

export default function ArtistDiscographyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const isConnected = useLidarr((store) => store.isConnected);
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];

  const { data, isLoading, error } = useArtistDiscography(id, name);

  // If we auto-added this artist purely to browse and the user leaves without
  // monitoring/downloading anything, remove it again so browsing doesn't
  // pollute the Lidarr library. Re-checks fresh state at leave time so an album
  // the user actually added is never deleted.
  const cleanupRef = useRef<{ artistId: number; created: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (data)
      cleanupRef.current = { artistId: data.artistId, created: data.created };
  }, [data]);
  useEffect(() => {
    return () => {
      const info = cleanupRef.current;
      if (!info?.created) return;
      void (async () => {
        try {
          const albums = await getArtistAlbums(info.artistId);
          const committed = albums.some(
            (a) => a.monitored || (a.statistics?.trackFileCount ?? 0) > 0,
          );
          if (!committed) await deleteArtist(info.artistId);
        } catch {
          // best-effort cleanup
        }
      })();
    };
  }, []);

  if (!isConnected) {
    return <Redirect href="/downloaders/lidarr" />;
  }

  const albums = [...(data?.albums ?? [])]
    .filter((a) => a.foreignAlbumId)
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));

  return (
    <Box className="h-full">
      <HStack
        className="items-center gap-x-4 px-6 pb-4"
        style={{ paddingTop: insets.top + 16 }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white flex-1" size="lg" numberOfLines={1}>
          {name ?? t("app.settings.downloaders.discovery.artist")}
        </Heading>
      </HStack>
      <FlashList
        data={albums}
        keyExtractor={(item: LidarrAlbum) => item.foreignAlbumId}
        renderItem={({ item }) => <LidarrAlbumRow album={item} />}
        ListHeaderComponent={error ? <ErrorDisplay error={error} /> : null}
        ListEmptyComponent={
          isLoading ? (
            <Box className="py-10">
              <ActivityIndicator color={emerald500} />
            </Box>
          ) : (
            <EmptyDisplay />
          )
        }
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}
