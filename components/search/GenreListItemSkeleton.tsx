import { Box } from "@/components/ui/box";
import { Skeleton, SkeletonText } from "../ui/skeleton";

export default function GenreListItemSkeleton() {
  return (
    <Box className="bg-primary-600 p-4 w-full rounded-md">
      <SkeletonText
        className="mb-12 h-4 w-1/2"
        speed={4}
        startColor="bg-primary-400"
      />
      <SkeletonText
        className="h-3 w-2/3"
        speed={4}
        startColor="bg-primary-400"
      />
    </Box>
  );
}
