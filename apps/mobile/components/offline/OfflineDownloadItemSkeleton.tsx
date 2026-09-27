import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { VStack } from "@/components/ui/vstack";

export default function OfflineDownloadItemSkeleton() {
  return (
    <HStack className="items-center mb-4">
      <Box className="w-6 h-6 mr-4">
        <Skeleton speed={4} variant="circular" startColor="bg-primary-400" />
      </Box>
      <Box className="rounded-md bg-primary-600 overflow-hidden aspect-square w-16 h-16">
        <Skeleton speed={4} variant="rounded" startColor="bg-primary-400" />
      </Box>
      <VStack className="ml-4 flex-1">
        <SkeletonText
          className="h-3 w-3/5 mb-2"
          _lines={1}
          speed={4}
          startColor="bg-primary-400"
        />
        <SkeletonText
          className="h-2 w-2/5 mb-2"
          _lines={1}
          speed={4}
          startColor="bg-primary-400"
        />
        <SkeletonText
          className="h-2 w-1/5"
          _lines={1}
          speed={4}
          startColor="bg-primary-400"
        />
      </VStack>
    </HStack>
  );
}
