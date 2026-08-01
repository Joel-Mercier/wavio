import Eye from "lucide-react-native/dist/esm/icons/eye.mjs";
import EyeOff from "lucide-react-native/dist/esm/icons/eye-off.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import DownloaderCover from "@/components/downloaders/DownloaderCover";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useSoulSyncWatchlist,
} from "@/hooks/soulsync/useWatchlist";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import type { SoulSyncArtist } from "@/services/soulsync/types";
import { watchlistArtistIds } from "@/services/soulsync/watchlist";

export default function SoulSyncArtistRow({
  artist,
  source,
}: {
  artist: SoulSyncArtist;
  // The provider the search result came from. SoulSync can't reliably infer it
  // from the id shape (a numeric Deezer id looks like an iTunes one), so it has
  // to be sent explicitly on a watchlist add.
  source?: string;
}) {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];

  const { data: watchlist } = useSoulSyncWatchlist();
  const add = useAddToWatchlist();
  const remove = useRemoveFromWatchlist();

  // A watchlist row stores its id in whichever provider column it came from,
  // and a search result can match a row added from a different provider, so
  // every column is compared — the same way the server matches an id.
  const isWatched = !!watchlist?.some((row) =>
    watchlistArtistIds(row).includes(artist.id),
  );
  const isPending = add.isPending || remove.isPending;

  const handleToggle = () => {
    if (isWatched) {
      remove.mutate(artist.id, {
        onSuccess: () =>
          showSuccessToast(
            t("app.settings.downloaders.soulsync.unwatchedMessage", {
              name: artist.name,
            }),
          ),
        onError: () =>
          showErrorToast(t("app.settings.downloaders.soulsync.watchFailed")),
      });
      return;
    }
    add.mutate(
      { artistId: artist.id, artistName: artist.name, source },
      {
        onSuccess: () =>
          showSuccessToast(
            t("app.settings.downloaders.soulsync.watchedMessage", {
              name: artist.name,
            }),
          ),
        onError: () =>
          showErrorToast(t("app.settings.downloaders.soulsync.watchFailed")),
      },
    );
  };

  return (
    <HStack className="items-center gap-x-3 px-6 py-3">
      <DownloaderCover
        url={artist.image_url ?? undefined}
        size={48}
        variant="artist"
      />
      <VStack className="flex-1">
        <Heading className="text-white font-normal" size="sm" numberOfLines={1}>
          {artist.name}
        </Heading>
        <Text className="text-primary-100 text-sm" numberOfLines={1}>
          {isWatched
            ? t("app.settings.downloaders.soulsync.watching")
            : t("app.settings.downloaders.soulsync.artist")}
        </Text>
      </VStack>
      {isPending ? (
        <Spinner color={emerald500} />
      ) : (
        <FadeOutScaleDown onPress={handleToggle}>
          {isWatched ? (
            <EyeOff size={22} color={emerald500} />
          ) : (
            <Eye size={22} color={white} />
          )}
        </FadeOutScaleDown>
      )}
    </HStack>
  );
}
