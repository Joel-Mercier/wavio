import Radio from "lucide-react-native/dist/esm/icons/radio.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import useWebsiteMetadata from "@/hooks/useWebsiteMetadata";
import type { InternetRadioStation } from "@/services/openSubsonic/types";
import type { RadioBrowserStation } from "@/services/radioBrowser/types";
import type {
  FavoriteRadioStation,
  RadioStationSource,
} from "@/stores/radioStations";
import { cn } from "@/utils/tailwind";

// Normalized shape shared by Radio-Browser results, server stations and
// stored favorites, so one list item renders every radio source.
export interface RadioStationItem {
  id: string;
  name: string;
  streamUrl: string;
  homePageUrl?: string;
  imageUrl?: string;
  tags?: string;
  // Radio-Browser-only metadata, surfaced on the detail screen.
  country?: string;
  countrySubdivision?: string;
  languages?: string;
  source: RadioStationSource;
}

export const radioBrowserToItem = (
  station: RadioBrowserStation,
): RadioStationItem => ({
  id: station.stationuuid,
  name: station.name,
  streamUrl: station.url_resolved || station.url,
  homePageUrl: station.homepage,
  imageUrl: station.favicon,
  tags: station.tags,
  country: station.country,
  countrySubdivision: station.state,
  languages: station.language,
  source: "radioBrowser",
});

export const serverToItem = (
  station: InternetRadioStation,
): RadioStationItem => ({
  id: station.id,
  name: station.name,
  streamUrl: station.streamUrl,
  homePageUrl: station.homePageUrl,
  source: "server",
});

export const favoriteToItem = (
  station: FavoriteRadioStation,
): RadioStationItem => ({
  id: station.id,
  name: station.name,
  streamUrl: station.streamUrl,
  homePageUrl: station.homePageUrl,
  imageUrl: station.imageUrl,
  tags: station.tags,
  country: station.country,
  countrySubdivision: station.countrySubdivision,
  languages: station.languages,
  source: station.source,
});

interface InternetRadioStationListItemProps {
  station: RadioStationItem;
  index?: number;
  layout?: "vertical" | "horizontal";
  className?: string;
}

export default function InternetRadioStationListItem({
  station,
  index = 0,
  layout = "horizontal",
  className = "",
}: InternetRadioStationListItemProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  // Only server stations need homepage scraping for cover art — Radio-Browser
  // (api) stations already provide an image, so skip the network round-trip.
  const meta = useWebsiteMetadata(
    station.source === "server" && !station.imageUrl
      ? station.homePageUrl
      : undefined,
  );
  const image = station.imageUrl || meta.image || meta["twitter:image"];
  return (
    <FadeOutScaleDown
      href={{
        pathname: "/internet-radio-stations/[id]",
        params: {
          id: station.id,
          name: station.name,
          streamUrl: station.streamUrl,
          homePageUrl: station.homePageUrl,
          imageUrl: image,
          tags: station.tags,
          country: station.country,
          countrySubdivision: station.countrySubdivision,
          languages: station.languages,
          source: station.source,
        },
      }}
      className={cn(className, {
        "mr-6": layout === "horizontal",
        "px-6": layout === "vertical",
        "mt-0": layout === "vertical" && index === 0,
        "pt-4": layout === "vertical" && index !== 0,
      })}
    >
      <VStack
        className={cn("transition duration-100 gap-y-2", {
          "w-32": layout === "horizontal",
          "flex-row items-center": layout === "vertical",
        })}
      >
        {image ? (
          <Image
            source={{ uri: image }}
            className={cn("rounded-md bg-primary-600 aspect-square", {
              "w-32 h-32": layout === "horizontal",
              "w-16 h-16": layout === "vertical",
            })}
            alt="Internet radio station cover"
            contentFit="contain"
          />
        ) : (
          <Box
            className={cn(
              "rounded-md bg-primary-600 items-center justify-center",
              {
                "w-32 h-32": layout === "horizontal",
                "w-16 h-16": layout === "vertical",
              },
            )}
          >
            <Radio size={layout === "horizontal" ? 48 : 28} color={white} />
          </Box>
        )}
        <VStack
          className={cn({
            "flex-col ml-4 flex-1": layout === "vertical",
          })}
        >
          <Heading
            size={layout === "horizontal" ? "sm" : "md"}
            className="text-white"
            numberOfLines={1}
          >
            {station.name}
          </Heading>
          <Text
            numberOfLines={layout === "horizontal" ? 2 : 1}
            className="text-md text-primary-100"
          >
            {station.homePageUrl}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}
