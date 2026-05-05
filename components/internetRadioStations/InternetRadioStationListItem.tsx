import { Radio } from "lucide-react-native";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import useWebsiteMetadata from "@/hooks/useWebsiteMetadata";
import type { InternetRadioStation } from "@/services/openSubsonic/types";

export default function InternetRadioStationListItem({
  internetRadioStation,
}: {
  internetRadioStation: InternetRadioStation;
}) {
  const meta = useWebsiteMetadata(internetRadioStation?.homePageUrl);
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
      className="mr-6"
    >
      <VStack className="transition duration-100 gap-y-2 w-32">
        {meta.image || meta["twitter:image"] ? (
          <Image
            source={{ uri: meta.image || meta["twitter:image"] }}
            className="w-32 h-32 rounded-md bg-primary-600 items-center justify-center"
            alt="Internet radio station cover"
            contentFit="contain"
          />
        ) : (
          <Box className="w-32 h-32 rounded-md bg-primary-600 items-center justify-center">
            <Radio size={48} color={themeConfig.theme.colors.white} />
          </Box>
        )}
        <VStack>
          <Heading size="sm" className="text-white" numberOfLines={1}>
            {internetRadioStation.name}
          </Heading>
          <Text numberOfLines={2} className="text-md text-primary-100">
            {internetRadioStation?.homePageUrl}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}
