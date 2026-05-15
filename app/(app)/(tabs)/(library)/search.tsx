import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import Fuse, { type FuseResult } from "fuse.js";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import LibraryListItem, {
  type Favorites,
  type LibraryFolder,
} from "@/components/library/LibraryListItem";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { useMusicFolders } from "@/hooks/openSubsonic/useBrowsing";
import useDebounce from "@/hooks/useDebounce";
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
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const form = useForm({
    defaultValues: {
      query: "",
    },
  });
  const query = useStore(form.store, (state) => state.values.query);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounce = useDebounce(150);
  const musicFolderId = useCurrentMusicFolderId();
  const [filter, setFilter] = useState<SearchFilter>(null);

  useEffect(() => {
    debounce(() => setDebouncedQuery(query));
  }, [query, debounce]);

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

  const fuse = useMemo(() => {
    if (!starredData?.starred2 || !playlistsData?.playlists) {
      return null;
    }
    const items: Array<unknown> = [];
    if ((!filter || filter === "artists") && starredData.starred2.artist) {
      items.push(starredData.starred2.artist);
    }
    if ((!filter || filter === "albums") && starredData.starred2.album) {
      items.push(starredData.starred2.album);
    }
    if (
      (!filter || filter === "playlists") &&
      playlistsData.playlists.playlist
    ) {
      items.push(playlistsData.playlists.playlist);
    }
    if (
      (!filter || filter === "folders") &&
      musicFoldersData?.musicFolders?.musicFolder
    ) {
      items.push(
        musicFoldersData.musicFolders.musicFolder.map((f) => ({
          id: String(f.id),
          name: f.name ?? `Library ${f.id}`,
          isFolder: true,
        })),
      );
    }

    return new Fuse<
      AlbumID3 & Playlist & ArtistID3 & Favorites & LibraryFolder
    >(
      items.flat() as Array<
        AlbumID3 & Playlist & ArtistID3 & Favorites & LibraryFolder
      >,
      {
        includeScore: true,
        ignoreDiacritics: true,
        keys: ["name"],
      },
    );
  }, [starredData, playlistsData, musicFoldersData, filter]);

  const data = useMemo(() => {
    if (!fuse || !debouncedQuery) return [];
    return fuse.search(debouncedQuery);
  }, [fuse, debouncedQuery]);

  return (
    <Box className="h-full flex-1">
      <Box
        className="bg-primary-600 px-6 py-6 mb-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <HStack className="items-center">
          <FadeOutScaleDown className="mr-4" onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <form.Field name="query">
            {(field) => (
              <Input className="flex-1 border-0">
                <InputField
                  className="text-white text-xl"
                  placeholder={t("app.library.search.inputPlaceholder")}
                  placeholderTextColor={primary50}
                  type="text"
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={field.handleBlur}
                  enterKeyHint="search"
                />
                <InputSlot className="pr-3" onPress={handleSearchClearPress}>
                  <InputIcon as={X} size="xl" />
                </InputSlot>
              </Input>
            )}
          </form.Field>
        </HStack>
      </Box>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow-0 px-6 mb-6"
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
      {(isLoadingPlaylists || isLoadingStarred || isLoadingMusicFolders) && (
        <Spinner size="large" />
      )}
      {(playlistsError || starredError || musicFoldersError) && (
        <ErrorDisplay
          error={(playlistsError || starredError || musicFoldersError) as Error}
        />
      )}
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
        ListEmptyComponent={<EmptyDisplay />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom:
            insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
      />
    </Box>
  );
}
