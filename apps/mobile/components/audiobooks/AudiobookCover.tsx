import BookHeadphones from "lucide-react-native/icons/book-headphones";
import { Uniwind } from "uniwind";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { audiobookCoverUrl } from "@/services/audiobookshelf/keys";
import useAudiobookshelf from "@/stores/audiobookshelf";
import { cn } from "@/utils/tailwind";

interface AudiobookCoverProps {
  itemId: string | undefined;
  className?: string;
  iconSize?: number;
  rounded?: string;
}

export default function AudiobookCover({
  itemId,
  className = "w-32 h-32",
  iconSize = 40,
  rounded = "rounded-md",
}: AudiobookCoverProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const serverUrl = useAudiobookshelf((s) => s.serverUrl);
  const uri =
    itemId && serverUrl ? audiobookCoverUrl(serverUrl, itemId) : undefined;
  return (
    <ImageWithFallback
      source={uri ? { uri } : undefined}
      className={cn("aspect-square", rounded, className)}
      alt=""
      contentFit="cover"
      fallback={
        <Box
          className={cn(
            "aspect-square bg-primary-600 items-center justify-center",
            rounded,
            className,
          )}
        >
          <BookHeadphones size={iconSize} color={white} />
        </Box>
      }
    />
  );
}
