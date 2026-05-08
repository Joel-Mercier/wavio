import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import Fuse, { type FuseResult } from "fuse.js";
import { ArrowLeft, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import LibraryListItem, {
  type Favorites,
  type LibraryFolder,
} from "@/components/library/LibraryListItem";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { themeConfig } from "@/config/theme";
import { useMusicFolders } from "@/hooks/openSubsonic/useBrowsing";
import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import { usePlaylists } from "@/hooks/openSubsonic/usePlaylists";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { cn } from "@/utils/tailwind";

type SearchFilter = "albums" | "artists" | "playlists" | "folders" | null;

export default function LibrarySearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const form = useForm({
    defaultValues: {
      query: "",
    },
  });
  const query = useStore(form.store, (state) => state.values.query);
  const musicFolderId = useCurrentMusicFolderId();
  const [filter, setFilter] = useState<SearchFilter>(null);

  const {
    data: starredData,
    isLoading: isLoadingStarred,
    error: starredError,
  } = useStarred2({ musicFolderId });
  const {
    data: playlistsData,
    isLoading: isLoadingPlaylists,
    error: playlistsError,
  } = usePlaylists({});
  const {
    data: musicFoldersData,
    isLoading: isLoadingMusicFolders,
    error: musicFoldersError,
  } = useMusicFolders();

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const handleFilterPress = (type: NonNullable<SearchFilter>) => {
    setFilter(type === filter ? null : type);
  };

  const data = useMemo(() => {
    if (!starredData?.starred2 || !playlistsData?.playlists) {
      return [];
    }
    let data = [];
    if ((!filter || filter === "artists") && starredData.starred2.artist) {
      data.push(starredData.starred2.artist);
    }
    if ((!filter || filter === "albums") && starredData.starred2.album) {
      data.push(starredData.starred2.album);
    }
    if (
      (!filter || filter === "playlists") &&
      playlistsData.playlists.playlist
    ) {
      data.push(playlistsData.playlists.playlist);
    }
    if (
      (!filter || filter === "folders") &&
      musicFoldersData?.musicFolders?.musicFolder
    ) {
      data.push(
        musicFoldersData.musicFolders.musicFolder.map((f) => ({
          id: String(f.id),
          name: f.name ?? `Library ${f.id}`,
          isFolder: true,
        })),
      );
    }

    data = data.flat();
    const options = {
      includeScore: true,
      ignoreDiacritics: true,
      keys: ["name"],
    };

    const fuse = new Fuse<
      AlbumID3 & Playlist & ArtistID3 & Favorites & LibraryFolder
    >(
      data as Array<
        AlbumID3 & Playlist & ArtistID3 & Favorites & LibraryFolder
      >,
      options,
    );

    const result = fuse.search(query);
    return result;
  }, [starredData, playlistsData, musicFoldersData, query, filter]);

  return (
    <SafeAreaView className="h-full" edges={["bottom", "left", "right"]}>
      <FlashList
        data={data}
        keyExtractor={(item) => item.item.id}
        renderItem={({
          item,
          index,
        }: {
          item: FuseResult<
            AlbumID3 & Playlist & ArtistID3 & Favorites & LibraryFolder
          >;
          index: number;
        }) => (
          <Box className="px-6">
            <LibraryListItem item={item.item} layout="list" index={index} />
          </Box>
        )}
        contentInsetAdjustmentBehavior="automatic"
        ListEmptyComponent={<EmptyDisplay />}
        ListHeaderComponent={
          <>
            <Box className="bg-primary-600 px-6 py-6 mb-6">
              <SafeAreaView edges={["top"]}>
                <HStack className="items-center">
                  <FadeOutScaleDown
                    className="mr-4"
                    onPress={() => router.back()}
                  >
                    <ArrowLeft size={24} color="white" />
                  </FadeOutScaleDown>
                  <form.Field name="query">
                    {(field) => (
                      <Input className="flex-1 border-0">
                        <InputField
                          className="text-white text-xl"
                          placeholder={t("app.library.search.inputPlaceholder")}
                          placeholderTextColor={
                            themeConfig.theme.colors.primary[50]
                          }
                          type="text"
                          value={field.state.value}
                          onChangeText={field.handleChange}
                          onBlur={field.handleBlur}
                          enterKeyHint="search"
                        />
                        <InputSlot
                          className="pr-3"
                          onPress={handleSearchClearPress}
                        >
                          <InputIcon as={X} size="xl" />
                        </InputSlot>
                      </Input>
                    )}
                  </form.Field>
                </HStack>
              </SafeAreaView>
            </Box>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="px-6 mb-6"
            >
              <FadeOutScaleDown onPress={() => handleFilterPress("albums")}>
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                    "bg-emerald-500": filter === "albums",
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.album_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={() => handleFilterPress("artists")}>
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                    "bg-emerald-500": filter === "artists",
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.artist_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={() => handleFilterPress("playlists")}>
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                    "bg-emerald-500": filter === "playlists",
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.playlist_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={() => handleFilterPress("folders")}>
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1", {
                    "bg-emerald-500": filter === "folders",
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.folder_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
            </ScrollView>
            {(isLoadingPlaylists ||
              isLoadingStarred ||
              isLoadingMusicFolders) && <Spinner size="large" />}
            {(playlistsError || starredError || musicFoldersError) && (
              <ErrorDisplay
                error={
                  (playlistsError ||
                    starredError ||
                    musicFoldersError) as Error
                }
              />
            )}
          </>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
