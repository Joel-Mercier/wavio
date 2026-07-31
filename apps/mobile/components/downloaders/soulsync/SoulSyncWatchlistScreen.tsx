import { Redirect } from "expo-router";
import RefreshCw from "lucide-react-native/dist/esm/icons/refresh-cw.mjs";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2.mjs";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { Uniwind } from "uniwind";
import DownloaderCover from "@/components/downloaders/DownloaderCover";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useRemoveFromWatchlist,
  useScanWatchlist,
  useSoulSyncWatchlist,
} from "@/hooks/soulsync/useWatchlist";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { watchlistArtistId } from "@/services/soulsync/watchlist";
import useSoulSync from "@/stores/soulsync";

export default function SoulSyncWatchlistScreen() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [white, red500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-red-500",
  ]) as string[];
  const isConnected = useSoulSync((store) => store.isConnected);
  const { data: artists, isLoading, error } = useSoulSyncWatchlist();
  const remove = useRemoveFromWatchlist();
  const scan = useScanWatchlist();

  if (!isConnected) {
    return <Redirect href="/downloaders/soulsync" />;
  }

  const items = artists ?? [];

  const handleScan = () => {
    scan.mutate(undefined, {
      onSuccess: () =>
        showSuccessToast(
          t("app.settings.downloaders.soulsync.scanStartedMessage"),
        ),
      onError: () =>
        showErrorToast(t("app.settings.downloaders.soulsync.scanFailed")),
    });
  };

  const handleRemove = (artistId: string) => {
    remove.mutate(artistId, {
      onError: () =>
        showErrorToast(t("app.settings.downloaders.soulsync.watchFailed")),
    });
  };

  return (
    <SettingsScreenScaffold
      title={t("app.settings.downloaders.soulsync.watchlistTitle")}
    >
      <VStack className="gap-y-2">
        <Text className="text-primary-100 text-sm py-2">
          {t("app.settings.downloaders.soulsync.watchlistDescription")}
        </Text>

        <FadeOutScaleDown
          onPress={handleScan}
          disabled={scan.isPending || items.length === 0}
          className="self-start"
          disabledOpacity={0.4}
        >
          <HStack className="items-center gap-x-2 py-2">
            <RefreshCw size={18} color={white} />
            <Text className="text-white text-sm">
              {t("app.settings.downloaders.soulsync.scanAction")}
            </Text>
          </HStack>
        </FadeOutScaleDown>

        <Box className="h-px bg-primary-500 my-2" />

        {isLoading && items.length === 0 ? (
          <Box className="py-6 items-center">
            <ActivityIndicator />
          </Box>
        ) : error && items.length === 0 ? (
          // Nothing was fetched, so "no watched artists" would be a claim the
          // app can't make.
          <Text className="text-red-400 text-sm py-2">
            {t("app.settings.downloaders.soulsync.loadFailed")}
          </Text>
        ) : items.length === 0 ? (
          <Text className="text-primary-100 text-sm py-2">
            {t("app.settings.downloaders.soulsync.emptyWatchlist")}
          </Text>
        ) : (
          items.map((artist) => {
            const artistId = watchlistArtistId(artist);
            return (
              <HStack
                key={artistId ?? artist.id}
                className="items-center gap-x-3 py-3"
              >
                <DownloaderCover
                  url={artist.image_url ?? undefined}
                  size={44}
                  variant="artist"
                />
                <VStack className="flex-1">
                  <Heading
                    className="text-white font-normal"
                    size="sm"
                    numberOfLines={1}
                  >
                    {artist.artist_name}
                  </Heading>
                  {artist.source && (
                    <Text className="text-primary-100 text-sm">
                      {artist.source}
                    </Text>
                  )}
                </VStack>
                {/* A row with no provider id can't be addressed by the API at
                    all, so offering to remove it would only ever fail. */}
                {!!artistId && (
                  <FadeOutScaleDown
                    onPress={() => handleRemove(artistId)}
                    disabled={remove.isPending}
                  >
                    <Trash2 size={20} color={red500} />
                  </FadeOutScaleDown>
                )}
              </HStack>
            );
          })
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
