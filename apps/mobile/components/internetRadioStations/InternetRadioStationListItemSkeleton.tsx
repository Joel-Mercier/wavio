import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

interface InternetRadioStationListItemSkeletonProps {
  layout?: "vertical" | "horizontal";
  index?: number;
}

export default function InternetRadioStationListItemSkeleton({
  layout = "horizontal",
  index = 0,
}: InternetRadioStationListItemSkeletonProps) {
  // Row layout (small cover left, text right) — matches the vertical list item
  // used in the search results / favorites list.
  if (layout === "vertical") {
    return (
      <HStack
        className={cn("items-center px-6", {
          "mt-0": index === 0,
          "pt-4": index !== 0,
        })}
      >
        <Skeleton
          className="w-16 h-16 aspect-square rounded-md"
          variant="rounded"
          startColor="bg-primary-400"
          speed={4}
        />
        <VStack className="ml-4 flex-1">
          <SkeletonText
            className="text-white h-3 mb-2 w-2/5"
            _lines={1}
            speed={4}
            startColor="bg-primary-400"
          />
          <SkeletonText
            className="text-md text-primary-100 h-2 w-1/5"
            _lines={1}
            speed={4}
            startColor="bg-primary-400"
          />
        </VStack>
      </HStack>
    );
  }

  // Card layout (cover on top, text below) — matches the horizontal list item
  // used in the discovery rows.
  return (
    <VStack className="gap-y-2 w-32 mr-6">
      <Box className="bg-primary-600">
        <Skeleton
          className="w-32 h-32 aspect-square rounded-md items-center justify-center"
          variant="rounded"
          startColor="bg-primary-400"
          speed={4}
        />
      </Box>
      <VStack className="w-full">
        <SkeletonText
          className="text-white h-3 mb-2 w-2/5"
          _lines={1}
          speed={4}
          startColor="bg-primary-400"
        />
        <SkeletonText
          _lines={1}
          className="text-md text-primary-100 h-2 w-1/5"
          speed={4}
          startColor="bg-primary-400"
        />
      </VStack>
    </VStack>
  );
}
