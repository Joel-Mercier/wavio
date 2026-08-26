import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import TidarrAlbumRow from "@/components/downloaders/tidarr/TidarrAlbumRow";
import TidarrArtistRow from "@/components/downloaders/tidarr/TidarrArtistRow";
import TidarrTrackRow from "@/components/downloaders/tidarr/TidarrTrackRow";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useDownloadedIds } from "@/hooks/tidarr/useTidarrDownloads";
import { useTidarrSearch } from "@/hooks/tidarr/useTidarrSearch";
import useDebounce from "@/hooks/useDebounce";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type {
  TidalAlbum,
  TidalArtist,
  TidalTrack,
} from "@/services/tidarr/types";
import useTidarr from "@/stores/tidarr";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

// One Tidal search answers all three kinds at once, so the chips narrow what
// the list shows rather than what is fetched.
type SearchFilter = "albums" | "artists" | "tracks";

const FILTERS: SearchFilter[] = ["albums", "artists", "tracks"];

type Row =
  | { kind: "header"; id: string; label: string }
  | { kind: "album"; id: string; album: TidalAlbum }
  | { kind: "artist"; id: string; artist: TidalArtist }
  | { kind: "track"; id: string; track: TidalTrack };

const keyExtractor = (item: Row) => item.id;

// Four row shapes share the list; without this they also share one recycling
// pool, so a header cell gets reused as an album row.
const getItemType = (item: Row) => item.kind;

export default function TidarrSearchScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const screenBottomPadding = useScreenBottomPadding();
  const [primary50, primary100, emerald500] = Uniwind.getCSSVariable([
    "--color-primary-50",
    "--color-primary-100",
    "--color-emerald-500",
  ]) as string[];
  const isConnected = useTidarr((store) => store.isConnected);

  // Seeded when another screen sends a name here to look up (e.g. an artist the
  // library doesn't hold), so the results are already on screen.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [term, setTerm] = useState(q ?? "");
  const [debouncedTerm, setDebouncedTerm] = useState(q ?? "");
  const [filter, setFilter] = useState<SearchFilter[]>([]);
  const debounce = useDebounce(400);
  const listRef = useRef<FlashListRef<Row>>(null);

  const { data, isFetching, error } = useTidarrSearch(debouncedTerm);
  const { data: downloadedIds } = useDownloadedIds();

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const noFilter = filter.length === 0;
    const sections: { header: Row; items: Row[] }[] = [];
    const albums = data.albums?.items ?? [];
    const artists = data.artists?.items ?? [];
    const tracks = data.tracks?.items ?? [];

    if ((noFilter || filter.includes("albums")) && albums.length) {
      sections.push({
        header: {
          kind: "header",
          id: "h-albums",
          label: t("app.settings.downloaders.tidarr.albumsSection"),
        },
        items: albums.map((album) => ({
          kind: "album",
          id: `al-${album.id}`,
          album,
        })),
      });
    }
    if ((noFilter || filter.includes("artists")) && artists.length) {
      sections.push({
        header: {
          kind: "header",
          id: "h-artists",
          label: t("app.settings.downloaders.tidarr.artistsSection"),
        },
        items: artists.map((artist) => ({
          kind: "artist",
          id: `ar-${artist.id}`,
          artist,
        })),
      });
    }
    if ((noFilter || filter.includes("tracks")) && tracks.length) {
      sections.push({
        header: {
          kind: "header",
          id: "h-tracks",
          label: t("app.settings.downloaders.tidarr.tracksSection"),
        },
        items: tracks.map((track) => ({
          kind: "track",
          id: `tr-${track.id}`,
          track,
        })),
      });
    }
    // A lone section's header would only repeat the filter chip above it.
    return sections.flatMap((section) =>
      sections.length > 1 ? [section.header, ...section.items] : section.items,
    );
  }, [data, filter, t]);

  const downloaded = useMemo(
    () => new Set(downloadedIds ?? []),
    [downloadedIds],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "header") {
        return (
          <Heading className="text-white px-6 pt-4 pb-1" size="md">
            {item.label}
          </Heading>
        );
      }
      return (
        <Box className="px-6">
          {item.kind === "album" ? (
            <TidarrAlbumRow
              album={item.album}
              isDownloaded={downloaded.has(String(item.album.id))}
            />
          ) : item.kind === "artist" ? (
            <TidarrArtistRow artist={item.artist} />
          ) : (
            <TidarrTrackRow
              track={item.track}
              isDownloaded={downloaded.has(String(item.track.id))}
            />
          )}
        </Box>
      );
    },
    [downloaded],
  );

  // Toggling a filter or editing the query swaps the result set; without this
  // the FlashList keeps its old offset and lands mid-list, hiding the new top
  // matches.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [filter, debouncedTerm]);

  if (!isConnected) {
    return <Redirect href="/downloaders/tidarr" />;
  }

  const handleChange = (value: string) => {
    setTerm(value);
    debounce(() => setDebouncedTerm(value));
  };

  const handleClear = () => {
    // The in-flight debounce would otherwise land after the clear and put the
    // results of the wiped term back on screen.
    debounce.cancel();
    setTerm("");
    setDebouncedTerm("");
  };

  const handleFilterPress = (kind: SearchFilter) => {
    setFilter(
      filter.includes(kind)
        ? filter.filter((f) => f !== kind)
        : [...filter, kind],
    );
  };

  const hasQuery = debouncedTerm.trim().length >= 2;

  return (
    <Box className="h-full">
      <Box className="bg-primary-600 px-6 py-6">
        <Box style={{ paddingTop: insets.top }}>
          <HStack className="items-center">
            <FadeOutScaleDown
              className="mr-4"
              onPress={() => goBackOrHome(router)}
            >
              <ArrowLeft size={24} color="white" />
            </FadeOutScaleDown>
            <Input className="flex-1 border-0">
              <InputSlot className="pl-1 pr-2">
                <InputIcon as={Search} color={primary100} size="lg" />
              </InputSlot>
              <InputField
                disableFullscreenUI
                className="text-white text-xl"
                placeholder={t(
                  "app.settings.downloaders.tidarr.inputPlaceholder",
                )}
                placeholderTextColor={primary50}
                value={term}
                onChangeText={handleChange}
                enterKeyHint="search"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {term.length > 0 && (
                <InputSlot className="pr-3" onPress={handleClear}>
                  <InputIcon as={X} size="xl" />
                </InputSlot>
              )}
            </Input>
          </HStack>
          <HStack className="gap-x-2 mt-4">
            {FILTERS.map((kind) => (
              <FadeOutScaleDown
                key={kind}
                onPress={() => handleFilterPress(kind)}
              >
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1", {
                    "bg-emerald-500": filter.includes(kind),
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t(`app.settings.downloaders.tidarr.${kind}Section`)}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
            ))}
          </HStack>
        </Box>
      </Box>

      <FlashList
        ref={listRef}
        data={rows}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        renderItem={renderItem}
        ListHeaderComponent={error ? <ErrorDisplay error={error} /> : null}
        ListEmptyComponent={
          // Without the error check a failed search would render the header's
          // error and "no results" underneath it, one contradicting the other.
          hasQuery && !isFetching && !error ? (
            <EmptyDisplay />
          ) : !hasQuery ? (
            <VStack className="items-center px-10 py-16">
              <Text className="text-primary-100 text-center">
                {t("app.settings.downloaders.tidarr.emptyPrompt")}
              </Text>
            </VStack>
          ) : null
        }
        ListFooterComponent={
          hasQuery && isFetching ? (
            <Box className="py-6">
              <ActivityIndicator color={emerald500} />
            </Box>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}
