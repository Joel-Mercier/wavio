import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import { memo } from "react";
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
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

interface AlbumListItemProps {
  album: AlbumID3;
  index: number;
  layout?: "vertical" | "horizontal";
  className?: string;
}

// Rendered in album grids/rows app-wide — memoized so a parent re-render
// doesn't re-render all visible rows.
function AlbumListItem({
  album,
  index,
  layout = "vertical",
  className = "",
}: AlbumListItemProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const isDetailCached = useIsDetailCached(["album", album.id]);
  const isDownloaded = useIsCollectionAvailableOffline("album", album.id);
  return (
    <FadeOutScaleDown
      href={`/albums/${album.id}`}
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
            album.coverArt ? { uri: artworkUrl(album.coverArt) } : undefined
          }
          className={cn("rounded-md aspect-square", {
            "w-32 h-32": layout === "horizontal",
            "w-24 h-24": layout === "vertical",
          })}
          alt="Album cover"
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
              <Disc3 size={48} color={white} />
            </Box>
          }
        />
        <VStack
          className={cn({
            "flex-col ml-4 flex-1": layout === "vertical",
          })}
        >
          {album.releaseTypes && album.releaseTypes.length > 0 ? (
            <Text numberOfLines={1} className="text-md text-primary-100">
              {album.releaseTypes
                .map((type) =>
                  type.toLowerCase() === "ep"
                    ? type.toUpperCase()
                    : type.charAt(0).toUpperCase() +
                      type.slice(1).toLowerCase(),
                )
                .join(" · ")}
            </Text>
          ) : (
            <Text className="text-md text-primary-100" numberOfLines={1}>
              {" "}
            </Text>
          )}
          <HStack className="items-center gap-x-2">
            {isDownloaded && <DownloadedBadge />}
            <Heading
              size={layout === "horizontal" ? "sm" : "lg"}
              className="text-white flex-1"
              numberOfLines={1}
            >
              {album.name}
            </Heading>
          </HStack>
          <Text numberOfLines={2} className="text-md text-primary-100">
            {layout === "horizontal" ? album.artist : album.year}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default memo(AlbumListItem);
