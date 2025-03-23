import type { LibraryLayout } from "@/app/(tabs)/library";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";
import { Link } from "expo-router";

interface LibraryListItemProps {
  layout: LibraryLayout;
}

export default function LibraryListItem({ layout }: LibraryListItemProps) {
  return (
    <Link href="/favorites">
      <HStack
        className={cn("items-center", {
          "flex-col items-start": layout === "grid",
        })}
      >
        <Image
          source={require("@/assets/images/covers/gunship-unicorn.jpg")}
          className={cn("w-20 h-20 rounded-md aspect-square", {
            "w-full": layout === "grid",
          })}
          alt="Libray item cover"
        />
        <VStack className={cn("ml-4", { "ml-0 mt-2": layout === "grid" })}>
          <Heading
            numberOfLines={layout === "grid" ? 2 : 1}
            className="text-white text-md font-normal capitalize"
          >
            Favorite tracks
          </Heading>
          <Text numberOfLines={1} className="text-md text-primary-100">
            Playlist ⦁ 14 songs
          </Text>
        </VStack>
      </HStack>
    </Link>
  );
}
