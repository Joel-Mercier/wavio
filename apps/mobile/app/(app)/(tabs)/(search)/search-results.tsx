import { FlashList } from "@shopify/flash-list";
import { useForm } from "@tanstack/react-form";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AudioMuseSearchResults from "@/components/audiomuse/AudioMuseSearchResults";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SearchResultListItem from "@/components/search/SearchResultListItem";
import TabBar, { type TabBarItem } from "@/components/TabBar";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { ScrollView } from "@/components/ui/scroll-view";
import { useSearch3 } from "@/hooks/backend/useSearching";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AlbumID3, ArtistID3, Child } from "@/services/openSubsonic/types";
import useAudioMuse from "@/stores/audioMuse";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useRecentSearches from "@/stores/recentSearches";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

export default function SearchResultsScreen() {
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];
  const { t } = useTranslation();
  const { query } = useLocalSearchParams<{ query: string }>();
  const [filter, setFilter] = useState<
    Array<"artists" | "albums" | "playlists" | "songs">
  >([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const screenBottomPadding = useScreenBottomPadding();
  const insets = useSafeAreaInsets();
  const musicFolderId = useCurrentMusicFolderId();
  const addRecentSearch = useRecentSearches((store) => store.addRecentSearch);
  const audioMuseConnected = useAudioMuse((store) => store.isConnected);
  const clapEnabled = useAudioMuse((store) => store.clapEnabled);
  const lyricsEnabled = useAudioMuse((store) => store.lyricsEnabled);

  // AudioMuse-AI's semantic indexes are opt-in per deployment, so each extra tab
  // only appears when the connected instance actually answers to it. With none
  // available the screen renders exactly as it did before the integration.
  const tabs = useMemo<TabBarItem[]>(() => {
    const items: TabBarItem[] = [
      { key: "library", title: t("app.search.tabs.library") },
    ];
    if (audioMuseConnected && clapEnabled) {
      items.push({ key: "sound", title: t("app.search.tabs.sound") });
    }
    if (audioMuseConnected && lyricsEnabled) {
      items.push({ key: "lyrics", title: t("app.search.tabs.lyrics") });
    }
    return items;
  }, [audioMuseConnected, clapEnabled, lyricsEnabled, t]);
  // A tab can disappear under the user (the token is removed, or a refresh turns
  // a feature off), so never leave the index pointing past the end.
  const safeTabIndex = Math.min(activeTabIndex, tabs.length - 1);
  const activeTab = tabs[safeTabIndex]?.key ?? "library";

  const { data, isLoading, error } = useSearch3(
    query,
    {
      albumCount: 12,
      albumOffset: 0,
      songCount: 12,
      songOffset: 0,
      artistCount: 12,
      artistOffset: 0,
      musicFolderId,
    },
    // Held back while an AudioMuse tab is showing, so opening the screen fires
    // one search instead of every tab's at once.
    { enabled: activeTab === "library" },
  );
  const router = useRouter();
  const form = useForm({
    defaultValues: {
      query,
    },
  });

  // `defaultValues` only seeds the field on mount, but the router reuses this
  // screen when navigating in with a different query — so track the param and
  // push it into the field when it actually changes. Keyed off the param, never
  // the field, so it can't fight the user mid-typing.
  const lastSyncedQuery = useRef(query);
  useEffect(() => {
    if (query !== lastSyncedQuery.current) {
      lastSyncedQuery.current = query;
      form.setFieldValue("query", query);
    }
  }, [query, form]);

  const searchData = useMemo(() => {
    if (!data || !data?.searchResult3) {
      return [];
    }

    const noFilter = filter.length === 0;
    const searchData = [];
    if ((noFilter || filter.includes("albums")) && data?.searchResult3?.album) {
      searchData.push(...data.searchResult3.album);
    }
    if (
      (noFilter || filter.includes("artists")) &&
      data?.searchResult3?.artist
    ) {
      searchData.push(...data.searchResult3.artist);
    }
    if ((noFilter || filter.includes("songs")) && data?.searchResult3?.song) {
      searchData.push(...data.searchResult3.song);
    }
    return searchData;
  }, [data, filter]);

  const handleSearchClearPress = () => {
    router.navigate("/recent-searches");
  };

  // The search bar on this screen was editable but inert: every result set —
  // library and AudioMuse alike — reads the `query` route param, which only the
  // recent-searches screen ever set. Submitting here rewrites that param, so a
  // new search re-runs in place instead of silently showing the old one.
  const handleSubmitQuery = () => {
    const trimmed = form.getFieldValue("query").trim();
    if (!trimmed || trimmed === query) return;
    addRecentSearch({
      id: `query:${trimmed}`,
      title: trimmed,
      type: "query",
    });
    router.setParams({ query: trimmed });
  };

  const handleFilterPress = (
    type: "artists" | "albums" | "playlists" | "songs",
  ) => {
    setFilter(
      filter.includes(type)
        ? filter.filter((f) => f !== type)
        : [...filter, type],
    );
  };

  return (
    <Box className="h-full flex-1">
      <Box
        className="bg-primary-600 px-6 py-6 mb-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <HStack className="items-center">
          <FadeOutScaleDown
            className="mr-4"
            onPress={() => goBackOrHome(router)}
          >
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <form.Field name="query">
            {(field) => (
              <Input className="flex-1 border-0">
                <InputField
                  disableFullscreenUI
                  className="text-white text-xl"
                  placeholder={t("app.search.inputPlaceholder")}
                  placeholderTextColor={primary50}
                  type="text"
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={field.handleBlur}
                  onSubmitEditing={handleSubmitQuery}
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
      {tabs.length > 1 && (
        <TabBar
          tabs={tabs}
          activeIndex={safeTabIndex}
          onTabPress={setActiveTabIndex}
          className="mb-4 bg-transparent"
        />
      )}
      {activeTab !== "library" ? (
        <AudioMuseSearchResults
          query={query}
          mode={activeTab as "sound" | "lyrics"}
        />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="grow-0 px-6 mb-6"
          >
            <FadeOutScaleDown onPress={() => handleFilterPress("albums")}>
              <Badge
                className={cn("rounded-full bg-primary-500 px-4 py-1 mr-2", {
                  "bg-emerald-500 text-primary-800": filter.includes("albums"),
                })}
              >
                <BadgeText className="normal-case text-md text-white">
                  {t("app.shared.filters.albums")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={() => handleFilterPress("artists")}>
              <Badge
                className={cn("rounded-full bg-primary-500 px-4 py-1 mr-2", {
                  "bg-emerald-500 text-primary-800": filter.includes("artists"),
                })}
              >
                <BadgeText className="normal-case text-md text-white">
                  {t("app.shared.filters.artists")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={() => handleFilterPress("songs")}>
              <Badge
                className={cn("rounded-full bg-primary-500 px-4 py-1 mr-2", {
                  "bg-emerald-500 text-primary-800": filter.includes("songs"),
                })}
              >
                <BadgeText className="normal-case text-md text-white">
                  {t("app.shared.filters.songs")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
          </ScrollView>
          {error && <ErrorDisplay error={error} />}
          {!error && (
            <FlashList
              data={
                (isLoading ? loadingData(12) : searchData) as Array<
                  AlbumID3 | Child | ArtistID3
                >
              }
              keyExtractor={(item, index) =>
                isLoading ? `skeleton-${index}` : item.id
              }
              renderItem={({
                item,
                index,
              }: {
                item: AlbumID3 | Child | ArtistID3;
                index: number;
              }) =>
                isLoading ? (
                  <TrackListItemSkeleton index={index} className="px-6" />
                ) : (
                  <Box className="px-6">
                    <SearchResultListItem
                      searchResult={item as AlbumID3 & Child & ArtistID3}
                    />
                  </Box>
                )
              }
              ListEmptyComponent={isLoading ? null : <EmptyDisplay />}
              contentContainerStyle={{
                paddingBottom: screenBottomPadding,
              }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}
    </Box>
  );
}
