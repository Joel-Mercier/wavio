import { type Href, router } from "expo-router";
import { AudioLines, Clock, Disc3, ListMusic, User } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import type { AlbumID3, ArtistID3, Child } from "@/services/openSubsonic/types";
import useRecentSearches from "@/stores/recentSearches";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

function SearchResultListItemIcon({
  type,
}: {
  type: "artist" | "album" | "playlist" | "song";
}) {
  if (type === "song") {
    return (
      <AudioLines
        size={24}
        color={themeConfig.theme.colors.white}
        fill={themeConfig.theme.colors.white}
      />
    );
  }
  if (type === "album") {
    return <Disc3 size={24} color={themeConfig.theme.colors.white} />;
  }
  if (type === "artist") {
    return <User size={24} color={themeConfig.theme.colors.white} />;
  }
  if (type === "playlist") {
    return <ListMusic size={24} color={themeConfig.theme.colors.white} />;
  }
  return <Clock size={24} color={themeConfig.theme.colors.white} />;
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
    if (searchResult.albumCount) {
      return {
        id: "artist",
        label: t("app.shared.artist_one"),
        url: `/artists/${searchResult.id}`,
      };
    }
    if (searchResult.year && searchResult.name) {
      return {
        id: "album",
        label: t("app.shared.album_one"),
        url: `/albums/${searchResult.id}`,
      };
    }
    if (searchResult.title) {
      return {
        id: "song",
        label: t("app.shared.song_one"),
        url: `/albums/${searchResult.albumId}`,
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
          <VStack className="ml-4">
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
