import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useIsArtistAvailableOffline,
  useIsDetailCached,
} from "@/hooks/offline";
import type { ArtistID3 } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

interface ArtistListItemProps {
  artist: ArtistID3;
  index?: number;
  layout?: "vertical" | "horizontal";
  className?: string;
}

function ArtistListItem({
  artist,
  index = 0,
  layout = "horizontal",
  className = "",
}: ArtistListItemProps) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const isReachableOffline = useIsDetailCached(["artist", artist.id]);
  // ArtistDetail also renders offline from downloaded album collections
  // (useOfflineArtist), so an extended-offline library keeps its artist rows
  // tappable without a cached detail query.
  const isAvailableFromCollections = useIsArtistAvailableOffline(artist.id);
  return (
    <FadeOutScaleDown
      href={`/artists/${artist.id}`}
      disabled={!isReachableOffline && !isAvailableFromCollections}
      className={cn(className, {
        "mt-0": layout === "vertical" && index === 0,
        "pt-4": layout === "vertical" && index !== 0,
        "px-6": layout === "vertical",
        "mr-6": layout === "horizontal",
      })}
    >
      <VStack
        className={cn("gap-y-2", {
          "w-32": layout === "horizontal",
          "flex-row items-center": layout === "vertical",
        })}
      >
        <ImageWithFallback
          source={
            artist.coverArt ? { uri: artworkUrl(artist.coverArt) } : undefined
          }
          className={cn("rounded-full aspect-square", {
            "w-32 h-32": layout === "horizontal",
            "w-24 h-24": layout === "vertical",
          })}
          alt={t("app.artists.coverAlt")}
          fallback={
            <Box
              className={cn(
                "rounded-full bg-primary-600 items-center justify-center aspect-square",
                {
                  "w-32 h-32": layout === "horizontal",
                  "w-24 h-24": layout === "vertical",
                },
              )}
            >
              <User size={48} color={white} />
            </Box>
          }
        />
        <VStack
          className={cn({
            "flex-col ml-4 flex-1": layout === "vertical",
          })}
        >
          <Heading
            size={layout === "horizontal" ? "sm" : "lg"}
            className="text-white"
            numberOfLines={1}
          >
            {artist.name}
          </Heading>
          <Text numberOfLines={2} className="text-md text-primary-100">
            {t("app.artists.label")}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default memo(ArtistListItem);
