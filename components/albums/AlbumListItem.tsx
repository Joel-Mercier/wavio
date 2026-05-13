import { Disc3 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

interface AlbumListItemProps {
  album: AlbumID3;
  index: number;
  layout?: "vertical" | "horizontal";
  className?: string;
}

export default function AlbumListItem({
  album,
  index,
  layout = "vertical",
  className = "",
}: AlbumListItemProps) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  return (
    <FadeOutScaleDown
      href={`/albums/${album.id}`}
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
        {album.coverArt ? (
          <Image
            source={{ uri: artworkUrl(album.coverArt) }}
            className={cn("rounded-md aspect-square", {
              "w-32 h-32": layout === "horizontal",
              "w-24 h-24": layout === "vertical",
            })}
            alt="Album cover"
          />
        ) : (
          <Box
            className={cn(
              "rounded-md bg-primary-600 items-center justify-center",
              {
                "w-32 h-32": layout === "horizontal",
                "w-24 h-24": layout === "vertical",
              },
            )}
          >
            <Disc3 size={48} color={white} />
          </Box>
        )}
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
