import { type Href, router } from "expo-router";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import Clock from "lucide-react-native/dist/esm/icons/clock.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { AlbumID3, ArtistID3, Child } from "@/services/openSubsonic/types";
import useRecentSearches from "@/stores/recentSearches";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

function SearchResultListItemIcon({
  type,
}: {
  type: "artist" | "album" | "playlist" | "song";
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  if (type === "song") {
    return <AudioLines size={24} color={white} fill={white} />;
  }
  if (type === "album") {
    return <Disc3 size={24} color={white} />;
  }
  if (type === "artist") {
    return <User size={24} color={white} />;
  }
  if (type === "playlist") {
    return <ListMusic size={24} color={white} />;
  }
  return <Clock size={24} color={white} />;
}

export default function SearchResultListItem({
  searchResult,
}: {
  searchResult: AlbumID3 & Child & ArtistID3;
}) {
  const { t } = useTranslation();
  const type = useMemo<{
    id: "artist" | "album" | "playlist" | "song";
    label: string;
    url: Href;
  }>(() => {
    // Discriminate by field presence rather than truthiness: search3 mixes
    // ArtistID3 / AlbumID3 / Child (song) into one list, and the local backend
    // emits placeholder counts (e.g. `albumCount: 0`) and frequently-missing
    // `year`, so heuristics like `if (albumCount)` or `year && name` misclassify
    // local artists/albums as playlists. Songs (Child) carry `title`, artists
    // carry `albumCount` (0 is valid), albums carry `name`.
    if (searchResult.title) {
      return {
        id: "song",
        label: t("app.shared.song_one"),
        url: `/albums/${searchResult.albumId}`,
      };
    }
    if (searchResult.albumCount !== undefined) {
      return {
        id: "artist",
        label: t("app.shared.artist_one"),
        url: `/artists/${searchResult.id}`,
      };
    }
    if (searchResult.name) {
      return {
        id: "album",
        label: t("app.shared.album_one"),
        url: `/albums/${searchResult.id}`,
      };
    }
    return {
      id: "playlist",
      label: t("app.shared.playlist_one"),
      url: `/playlists/${searchResult.id}`,
    };
  }, [searchResult, t]);

  const handlePress = () => {
    useRecentSearches.getState().addRecentSearch({
      id: searchResult.id,
      title: searchResult.title || searchResult.name,
      type: type.id,
      coverArt: searchResult.coverArt,
      albumId: searchResult.albumId,
      artist: searchResult.artist,
    });
    router.navigate(type.url);
  };

  return (
    <FadeOutScaleDown onPress={handlePress}>
      <HStack className="items-center justify-between mb-4">
        <HStack className="items-center">
          {searchResult.coverArt ? (
            <Image
              source={{ uri: artworkUrl(searchResult.coverArt) }}
              className={cn("w-16 h-16 rounded-md aspect-square", {
                "rounded-full": type.id === "artist",
              })}
              alt="Recent search cover"
            />
          ) : (
            <Box
              className={cn(
                "w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center",
                {
                  "rounded-full": type.id === "artist",
                },
              )}
            >
              <SearchResultListItemIcon type={type.id} />
            </Box>
          )}
          <VStack className="ml-4 flex-1">
            <Heading className="text-white font-normal" numberOfLines={1}>
              {searchResult.title || searchResult.name}
            </Heading>
            <HStack className="items-center">
              <Text className="text-primary-100">{type.label}</Text>
              {searchResult.artist && (
                <Text className="text-primary-100">
                  {` ⦁ ${searchResult.artist}`}
                </Text>
              )}
            </HStack>
          </VStack>
        </HStack>
      </HStack>
    </FadeOutScaleDown>
  );
}
