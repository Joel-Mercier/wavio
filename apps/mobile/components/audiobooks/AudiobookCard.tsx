import type { Href } from "expo-router";
import CircleCheckBig from "lucide-react-native/icons/circle-check-big";
import { memo } from "react";
import { Uniwind } from "uniwind";
import AudiobookCover from "@/components/audiobooks/AudiobookCover";
import AudiobookProgressBar from "@/components/audiobooks/AudiobookProgressBar";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { AbsBookProgress } from "@/hooks/audiobookshelf/useAudiobookshelf";
import { cn } from "@/utils/tailwind";

interface AudiobookCardProps {
  itemId: string;
  title: string;
  subtitle?: string;
  progress?: AbsBookProgress;
  layout?: "horizontal" | "vertical";
}

export function audiobookHref(itemId: string): Href {
  return { pathname: "/audiobooks/[id]", params: { id: itemId } };
}

function AudiobookCard({
  itemId,
  title,
  subtitle,
  progress,
  layout = "horizontal",
}: AudiobookCardProps) {
  const [emerald] = Uniwind.getCSSVariable(["--color-emerald-500"]) as string[];
  const vertical = layout === "vertical";
  return (
    <FadeOutScaleDown
      href={audiobookHref(itemId)}
      className={cn(vertical ? "px-6 py-2" : "mr-6")}
    >
      <VStack
        className={cn("gap-y-2", vertical ? "flex-row items-center" : "w-32")}
      >
        <Box>
          <AudiobookCover
            itemId={itemId}
            className={vertical ? "w-16 h-16" : "w-32 h-32"}
            iconSize={vertical ? 24 : 40}
          />
          {progress?.isFinished && (
            <Box className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5">
              <CircleCheckBig size={vertical ? 12 : 16} color={emerald} />
            </Box>
          )}
          {!vertical && !progress?.isFinished && (
            <AudiobookProgressBar
              progress={progress?.progress ?? 0}
              className="absolute bottom-1 left-1 right-1"
            />
          )}
        </Box>
        <VStack className={cn(vertical && "flex-1 ml-4 gap-y-1")}>
          <Heading
            size={vertical ? "md" : "sm"}
            className="text-white"
            numberOfLines={2}
          >
            {title}
          </Heading>
          {!!subtitle && (
            <Text numberOfLines={1} className="text-sm text-primary-100">
              {subtitle}
            </Text>
          )}
          {vertical && !progress?.isFinished && (
            <AudiobookProgressBar
              progress={progress?.progress ?? 0}
              className="mt-1 w-2/3"
            />
          )}
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default memo(AudiobookCard);
