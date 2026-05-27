import type { LibraryLayout } from "@/app/(app)/(tabs)/(library)/index";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

interface LibraryListItemSkeletonProps {
  layout: LibraryLayout;
  index: number;
}

export default function LibraryListItemSkeleton({
  layout,
  index,
}: LibraryListItemSkeletonProps) {
  return (
    <Box
      className={cn("mb-4", {
        "mr-2 ml-0": layout === "grid" && (index + 1) % 1 === 0,
        "mx-2": layout === "grid" && (index + 1) % 2 === 0,
        "ml-2 mr-0": layout === "grid" && (index + 1) % 3 === 0,
      })}
    >
      <HStack
        className={cn("flex-row transition duration-100 items-center", {
          "flex-col items-start": layout === "grid",
        })}
      >
        <Box
          className={cn(
            "rounded-md bg-primary-600 items-center justify-center overflow-hidden aspect-square",
            {
              "w-full": layout === "grid",
              "w-20 h-20": layout === "list",
            },
          )}
        >
          <Skeleton speed={4} variant="rounded" startColor="bg-primary-400" />
        </Box>
        <VStack className="w-full">
          <SkeletonText
            className={cn("h-3 w-2/3 ml-4 mb-2", {
              "ml-0 mt-2": layout === "grid",
            })}
            speed={4}
            startColor="bg-primary-400"
          />
          <SkeletonText
            className={cn("h-2 w-1/3 ml-4", {
              "ml-0": layout === "grid",
            })}
            speed={4}
            startColor="bg-primary-400"
          />
        </VStack>
      </HStack>
    </Box>
  );
}
