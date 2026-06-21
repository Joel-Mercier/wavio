import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import DownloadedBadge from "@/components/DownloadedBadge";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useIsCollectionAvailableOffline,
  useIsDetailCached,
} from "@/hooks/offline";
import type { Playlist } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

interface PlaylistListItemProps {
  playlist: Playlist;
  index: number;
  layout?: "vertical" | "horizontal";
  className?: string;
}

function PlaylistListItem({
  playlist,
  index,
  layout = "vertical",
  className = "",
}: PlaylistListItemProps) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const isDetailCached = useIsDetailCached(["playlist", playlist.id]);
  const isDownloaded = useIsCollectionAvailableOffline("playlist", playlist.id);
  return (
    <FadeOutScaleDown
      href={`/playlists/${playlist.id}`}
      disabled={!isDetailCached && !isDownloaded}
      className={cn(className, {
        "mt-0": layout === "vertical" && index === 0,
        "pt-4": layout === "vertical" && index !== 0,
        "px-6": layout === "vertical",
        "mr-6": layout === "horizontal",
      })}
    >
      <VStack
        className={cn("transition duration-100 gap-y-2", {
          "w-32": layout === "horizontal",
          "flex-row items-center": layout === "vertical",
        })}
      >
        <ImageWithFallback
          source={
            playlist.coverArt
              ? { uri: artworkUrl(playlist.coverArt) }
              : undefined
          }
          className={cn("rounded-md aspect-square", {
            "w-32 h-32": layout === "horizontal",
            "w-24 h-24": layout === "vertical",
          })}
          alt="Playlist cover"
          fallback={
            <Box
              className={cn(
                "rounded-md bg-primary-600 items-center justify-center aspect-square",
                {
                  "w-32 h-32": layout === "horizontal",
                  "w-24 h-24": layout === "vertical",
                },
              )}
            >
              <ListMusic size={48} color={white} />
            </Box>
          }
        />
        <VStack
          className={cn({
            "flex-col ml-4 flex-1": layout === "vertical",
          })}
        >
          <HStack className="items-center gap-x-2">
            {isDownloaded && <DownloadedBadge />}
            <Heading
              size={layout === "horizontal" ? "sm" : "lg"}
              className="text-white flex-1"
              numberOfLines={1}
            >
              {playlist.name}
            </Heading>
          </HStack>
          <Text numberOfLines={2} className="text-md text-primary-100">
            {t("app.shared.songCount", { count: playlist.songCount })}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default memo(PlaylistListItem);
