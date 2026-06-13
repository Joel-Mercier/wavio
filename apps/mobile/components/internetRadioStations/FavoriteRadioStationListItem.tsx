import Radio from "lucide-react-native/dist/esm/icons/radio.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Image } from "@/components/ui/image";
import type { FavoriteRadioStation } from "@/stores/radioStations";

interface FavoriteRadioStationListItemProps {
  station: FavoriteRadioStation;
}
export default function FavoriteRadioStationListItem({
  station,
}: FavoriteRadioStationListItemProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const href = {
    pathname: "/internet-radio-stations/[id]" as const,
    params: {
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
    },
  };
  if (station.imageUrl) {
    return (
      <FadeOutScaleDown href={href} className="rounded-lg">
        <Image
          source={{ uri: station.imageUrl }}
          className="aspect-square rounded-lg bg-primary-600"
          alt={station.name}
          contentFit="contain"
        />
      </FadeOutScaleDown>
    );
  }
  return (
    <FadeOutScaleDown href={href} className="rounded-lg">
      <Box className="w-20 h-20 rounded-lg bg-primary-600 items-center justify-center">
        <Radio size={40} color={white} />
      </Box>
    </FadeOutScaleDown>
  );
}
