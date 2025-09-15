import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

interface TrackListItemSkeletonProps {
  index: number;
  showCoverArt?: boolean;
  className?: string;
}

export default function TrackListItemSkeleton({
  index,
  showCoverArt = true,
  className,
}: TrackListItemSkeletonProps) {
  return (
    <HStack
      className={cn(
        "items-center justify-between mb-4",
        {
          "mt-6": index === 0,
        },
        className,
      )}
    >
      <HStack className="items-center">
        {showCoverArt && (
          <Box className="rounded-md bg-primary-600 items-center justify-center overflow-hidden aspect-square w-16 h-16">
            <Skeleton speed={4} variant="rounded" startColor="bg-primary-400" />
          </Box>
        )}
        <VStack
          className={cn("w-full", {
            "ml-4": showCoverArt,
          })}
        >
          <SkeletonText
            className="h-3 w-2/5 ml-4 mb-2"
            _lines={1}
            speed={4}
            startColor="bg-primary-400"
          />
          <SkeletonText
            className="h-2 w-1/5 ml-4"
            _lines={1}
            speed={4}
            startColor="bg-primary-400"
          />
        </VStack>
      </HStack>
    </HStack>
  );
}
