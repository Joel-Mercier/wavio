import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { VStack } from "@/components/ui/vstack";

export default function ShareListItemSkeleton() {
  return (
    <Box className="mb-4">
      <HStack className="flex-row items-center">
        <Box className="rounded-md bg-primary-600 items-center justify-center overflow-hidden aspect-square w-16 h-16">
          <Skeleton speed={4} variant="rounded" startColor="bg-primary-400" />
        </Box>
        <VStack className="w-full">
          <SkeletonText
            className="h-3 w-2/3 ml-4 mb-2"
            speed={4}
            startColor="bg-primary-400"
          />
          <SkeletonText
            className="h-2 w-1/3 ml-4"
            speed={4}
            startColor="bg-primary-400"
          />
        </VStack>
      </HStack>
    </Box>
  );
}
