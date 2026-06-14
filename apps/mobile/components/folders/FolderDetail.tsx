import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import Folder from "lucide-react-native/dist/esm/icons/folder.mjs";
import Play from "lucide-react-native/dist/esm/icons/play.mjs";
import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useIndexes, useMusicDirectory } from "@/hooks/backend/useBrowsing";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

type Entry =
  | { kind: "dir"; id: string; name: string }
  | { kind: "track"; child: Child };

export default function FolderDetail() {
  const [white, gray200] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-200",
  ]) as string[];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const { id, name, root } = useLocalSearchParams<{
    id: string;
    name?: string;
    root?: string;
  }>();
  const isRoot = root === "1";

  const indexesQuery = useIndexes(isRoot ? { musicFolderId: id } : {});
  const directoryQuery = useMusicDirectory(isRoot ? "" : id);

  const { isLoading, error, headerName, dirs, tracks } = useMemo(() => {
    if (isRoot) {
      const indexes = indexesQuery.data?.indexes;
      const dirs: Entry[] = [];
      for (const index of indexes?.index ?? []) {
        for (const artist of index.artist ?? []) {
          dirs.push({ kind: "dir", id: artist.id, name: artist.name });
        }
      }
      const tracks: Child[] = (indexes?.child ?? []).filter(
        (c) => !c.isDir && !c.isVideo,
      );
      return {
        isLoading: indexesQuery.isLoading,
        error: indexesQuery.error,
        headerName: name ?? "",
        dirs,
        tracks,
      };
    }
    const directory = directoryQuery.data?.directory;
    const children = directory?.child ?? [];
    const dirs: Entry[] = children
      .filter((c) => c.isDir)
      .map((c) => ({ kind: "dir", id: c.id, name: c.title }));
    const tracks: Child[] = children.filter((c) => !c.isDir && !c.isVideo);
    return {
      isLoading: directoryQuery.isLoading,
      error: directoryQuery.error,
      headerName: directory?.name ?? name ?? "",
      dirs,
      tracks,
    };
  }, [isRoot, indexesQuery, directoryQuery, name]);

  const entries: Entry[] = useMemo(
    () => [
      ...dirs,
      ...tracks.map((c) => ({ kind: "track" as const, child: c })),
    ],
    [dirs, tracks],
  );

  const handlePlayAllPress = () => {
    if (tracks.length === 0) return;
    playTracks(tracks.map(childToTrack), 0);
  };

  const handleTrackPress = useTrackListPress(tracks);

  return (
    <Box className="h-full w-full">
      <Box className="px-6 pb-4" style={{ paddingTop: insets.top + 16 }}>
        <HStack className="items-center justify-between">
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color={white} />
          </FadeOutScaleDown>
          <Heading
            numberOfLines={1}
            className="text-white text-center font-bold mx-4 truncate flex-1"
            size="lg"
          >
            {headerName}
          </Heading>
          {tracks.length > 0 ? (
            <FadeOutScaleDown onPress={handlePlayAllPress}>
              <Box className="w-10 h-10 rounded-full bg-emerald-500 items-center justify-center">
                <Play size={18} color={white} fill={white} />
              </Box>
            </FadeOutScaleDown>
          ) : (
            <Box className="w-10" />
          )}
        </HStack>
      </Box>
      {error && <ErrorDisplay error={error} />}
      {!error && (
        <FlashList
          data={isLoading ? (loadingData(12) as unknown as Entry[]) : entries}
          keyExtractor={(item, index) =>
            isLoading
              ? `skeleton-${index}`
              : item.kind === "dir"
                ? `d:${item.id}`
                : `t:${item.child.id}`
          }
          renderItem={({ item, index }) => {
            if (isLoading) {
              return <TrackListItemSkeleton index={index} className="px-6" />;
            }
            if (item.kind === "dir") {
              return (
                <FadeOutScaleDown
                  href={{
                    pathname: "/folders/[id]",
                    params: { id: item.id, name: item.name },
                  }}
                  className="px-6 mb-4"
                >
                  <HStack className="items-center">
                    <Box className="w-12 h-12 rounded-md bg-primary-600 items-center justify-center mr-4">
                      <Folder size={24} color={white} />
                    </Box>
                    <VStack className="flex-1">
                      <Text
                        numberOfLines={1}
                        className="text-white text-md font-normal"
                      >
                        {item.name}
                      </Text>
                    </VStack>
                    <ChevronRight size={20} color={gray200} />
                  </HStack>
                </FadeOutScaleDown>
              );
            }
            return (
              <TrackListItem
                track={item.child}
                index={index - dirs.length}
                onPress={handleTrackPress}
                className="px-6"
              />
            );
          }}
          ListEmptyComponent={() => (isLoading ? null : <EmptyDisplay />)}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Box>
  );
}
