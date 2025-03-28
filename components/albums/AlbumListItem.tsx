import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { Disc3 } from "lucide-react-native";

interface AlbumListItemProps {
  album: AlbumID3;
  index: number;
  layout?: "vertical" | "horizontal";
}

export default function AlbumListItem({
  album,
  index,
  layout = "vertical",
}: AlbumListItemProps) {
  const cover = useGetCoverArt(album.coverArt, { size: 200 }, !!album.coverArt);
  return (
    <FadeOutScaleDown
      href={`/albums/${album.id}`}
      className={cn({
        "mt-6": layout === "vertical" && index === 0,
        "mt-4": layout === "vertical",
        "mx-6": layout === "vertical",
        "mr-6": layout === "horizontal",
      })}
    >
      <VStack
        className={cn("transition duration-100 gap-y-2", {
          "w-32": layout === "horizontal",
          "flex-row items-center": layout === "vertical",
        })}
      >
        {cover.data ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${cover?.data}` }}
            className="w-32 h-32 rounded-md aspect-square"
            alt="Album cover"
          />
        ) : (
          <Box className="w-32 h-32 rounded-md bg-primary-600 items-center justify-center">
            <Disc3 size={48} color={themeConfig.theme.colors.white} />
          </Box>
        )}
        <VStack className={cn({ "flex-col ml-4": layout === "vertical" })}>
          <Heading
            size={layout === "horizontal" ? "sm" : "lg"}
            className="text-white"
            numberOfLines={1}
          >
            {album.name}
          </Heading>
          <Text numberOfLines={2} className="text-md text-primary-100">
            {layout === "horizontal" ? album.artist : album.year}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}
