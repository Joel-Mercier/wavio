import { Box } from "@/components/ui/box";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { VStack } from "@/components/ui/vstack";

export default function InternetRadioStationListItemSkeleton() {
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
