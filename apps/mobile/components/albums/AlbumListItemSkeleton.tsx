import { Box } from "@/components/ui/box";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

interface AlbumListItemSkeletonProps {
  index: number;
  layout?: "vertical" | "horizontal";
}

export default function AlbumListItemSkeleton({
  index,
  layout = "vertical",
}: AlbumListItemSkeletonProps) {
  return (
    <VStack
      className={cn("gap-y-2", {
        "mt-6": layout === "vertical" && index === 0,
        "mt-4": layout === "vertical",
        "mx-6": layout === "vertical",
        "mr-6": layout === "horizontal",
        "w-32": layout === "horizontal",
        "flex-row items-center": layout === "vertical",
      })}
    >
      <Box className="bg-primary-600">
        <Skeleton
          className="w-32 h-32 aspect-square rounded-md items-center justify-center"
          variant="rounded"
          startColor="bg-primary-400"
          speed={4}
        />
      </Box>
      <VStack
        className={cn("w-full", {
          "flex-col ml-4": layout === "vertical",
        })}
      >
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
