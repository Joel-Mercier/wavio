import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { VStack } from "@/components/ui/vstack";

export default function SongCardSkeleton() {
  return (
    <VStack className="w-32 gap-y-2 mr-6">
      <Skeleton
        variant="rounded"
        className="w-32 h-32"
        speed={4}
        startColor="bg-primary-400"
      />
      <SkeletonText
        className="h-3 w-3/4"
        _lines={1}
        speed={4}
        startColor="bg-primary-400"
      />
      <SkeletonText
        className="h-2 w-1/2"
        _lines={1}
        speed={4}
        startColor="bg-primary-400"
      />
    </VStack>
  );
}
