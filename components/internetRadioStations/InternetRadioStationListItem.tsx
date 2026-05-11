import { Radio } from "lucide-react-native";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import useWebsiteMetadata from "@/hooks/useWebsiteMetadata";
import type { InternetRadioStation } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";

interface InternetRadioStationListItemProps {
  internetRadioStation: InternetRadioStation;
  index?: number;
  layout?: "vertical" | "horizontal";
  className?: string;
}

export default function InternetRadioStationListItem({
  internetRadioStation,
  index = 0,
  layout = "horizontal",
  className = "",
}: InternetRadioStationListItemProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const meta = useWebsiteMetadata(internetRadioStation?.homePageUrl);
  const image = meta.image || meta["twitter:image"];
  return (
    <FadeOutScaleDown
      href={{
        pathname: "/internet-radio-stations/[id]",
        params: {
          id: internetRadioStation.id,
          name: internetRadioStation.name,
          streamUrl: internetRadioStation.streamUrl,
          homePageUrl: internetRadioStation?.homePageUrl,
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
            {internetRadioStation.name}
          </Heading>
          <Text
            numberOfLines={layout === "horizontal" ? 2 : 1}
            className="text-md text-primary-100"
          >
            {internetRadioStation?.homePageUrl}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}
