import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import LibraryListItem, {
  type Favorites,
} from "@/components/library/LibraryListItem";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { themeConfig } from "@/config/theme";
import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import { usePlaylists } from "@/hooks/openSubsonic/usePlaylists";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import Fuse, { type FuseResult } from "fuse.js";
import { ArrowLeft, X } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export default function LibrarySearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const form = useForm({
    defaultValues: {
      query: "",
    },
  });
  const query = useStore(form.store, (state) => state.values.query);

  const {
    data: starredData,
    isLoading: isLoadingStarred,
    isFetching: isFetchingStarred,
    error: starredError,
    refetch: refetchStarred,
  } = useStarred2({});
  const {
    data: playlistsData,
    isLoading: isLoadingPlaylists,
    isFetching: isFetchingPlaylists,
    error: playlistsError,
    refetch: refetchPlaylists,
  } = usePlaylists({});

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const data = useMemo(() => {
    if (
      !starredData ||
      !starredData?.starred2 ||
      !playlistsData ||
      !playlistsData?.playlists
    ) {
      return [];
    }
    let data = [];
    if (starredData.starred2.artist) {
      data.push(starredData.starred2.artist);
    }
    if (starredData.starred2.album) {
      data.push(starredData.starred2.album);
    }
    if (playlistsData.playlists.playlist) {
      data.push(playlistsData.playlists.playlist);
    }

    data = data.flat();
    const options = {
      includeScore: true,
      ignoreDiacritics: true,
      // Search in `author` and in `tags` array
      keys: ["name"],
    };

    const fuse = new Fuse<AlbumID3 & Playlist & ArtistID3 & Favorites>(
      data,
      options,
    );

    const result = fuse.search(query);
    return result;
  }, [starredData, playlistsData, query]);

  return (
    <SafeAreaView className="h-full" edges={["bottom", "left", "right"]}>
      <FlashList
        data={data}
        keyExtractor={(item) => item.item.id}
        renderItem={({
          item,
          index,
        }: {
          item: FuseResult<AlbumID3 & Playlist & ArtistID3 & Favorites>;
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
            {(isLoadingPlaylists || isLoadingStarred) && (
              <Spinner size="large" />
            )}
            {(playlistsError || starredError) && (
              <ErrorDisplay error={playlistsError || starredError} />
            )}
          </>
        }
      />
    </SafeAreaView>
  );
}
