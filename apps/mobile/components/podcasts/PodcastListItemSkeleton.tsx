import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

export default function PodcastListItemSkeleton({ index }: { index: number }) {
  return (
    <Box className="px-6">
      <VStack
        className={cn("my-3 gap-y-2 border-b border-b-primary-400", {
          "mt-6": index === 0,
        })}
      >
        <HStack className="gap-x-4">
          <Skeleton
            speed={4}
            variant="rounded"
            className="w-16 h-16 rounded-md aspect-square"
            startColor="bg-primary-400"
          />
          <VStack className="flex-1">
            <SkeletonText
              className="h-3 w-2/3 mb-2"
              speed={4}
              startColor="bg-primary-400"
            />
            <SkeletonText
              className="h-2 w-1/3"
              speed={4}
              startColor="bg-primary-400"
            />
          </VStack>
        </HStack>
        <SkeletonText
          className="h-2 w-full mb-1"
          speed={4}
          startColor="bg-primary-400"
        />
        <SkeletonText
          className="h-2 w-2/3 mb-1"
          speed={4}
          startColor="bg-primary-400"
        />
        <SkeletonText
          className="h-2 w-1/3"
          speed={4}
          startColor="bg-primary-400"
        />
        <Skeleton
          speed={4}
          startColor="bg-primary-400"
          className="h-12 w-full mb-4"
        />
      </VStack>
    </Box>
  );
}
