import type { Href } from "expo-router";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import AudiobookCover from "@/components/audiobooks/AudiobookCover";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

export function audiobookSeriesHref(seriesId: string, name?: string): Href {
  return {
    pathname: "/audiobooks/series/[id]",
    params: { id: seriesId, name },
  };
}

function AudiobookSeriesCard({
  seriesId,
  name,
  coverItemId,
  bookCount,
  layout = "horizontal",
}: {
  seriesId: string;
  name: string;
  coverItemId?: string;
  bookCount?: number;
  layout?: "horizontal" | "vertical";
}) {
  const { t } = useTranslation();
  const vertical = layout === "vertical";
  return (
    <FadeOutScaleDown
      href={audiobookSeriesHref(seriesId, name)}
      className={cn(vertical ? "px-6 py-2" : "mr-6")}
    >
      <VStack
        className={cn("gap-y-2", vertical ? "flex-row items-center" : "w-32")}
      >
        <Box className={vertical ? "w-16 h-16" : "w-32 h-32"}>
          <Box
            className={cn(
              "absolute top-0 right-0 rounded-md bg-primary-500",
              vertical ? "w-14 h-14" : "w-28 h-28",
            )}
          />
          <Box className="absolute bottom-0 left-0">
            <AudiobookCover
              itemId={coverItemId}
              className={vertical ? "w-14 h-14" : "w-28 h-28"}
              iconSize={vertical ? 24 : 36}
            />
          </Box>
        </Box>
        <VStack className={cn(vertical && "flex-1 ml-4")}>
          <Heading
            size={vertical ? "md" : "sm"}
            className="text-white"
            numberOfLines={2}
          >
            {name}
          </Heading>
          {bookCount != null && (
            <Text numberOfLines={1} className="text-sm text-primary-100">
              {t("app.audiobooks.bookCount", { count: bookCount })}
            </Text>
          )}
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default memo(AudiobookSeriesCard);
