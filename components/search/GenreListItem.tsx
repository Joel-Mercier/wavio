import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Genre } from "@/services/openSubsonic/types";
import { Link } from "expo-router";
import { Pressable } from "../ui/pressable";

interface GenreListItemProps {
  genre: Genre;
}

export default function GenreListItem({ genre }: GenreListItemProps) {
  return (
    <Link href={`/genres/${genre.value}`} asChild>
      <Pressable>
        <VStack className="bg-primary-600 p-4 w-full rounded-md">
          <Heading size="md" className="text-white mb-8">
            {genre.value}
          </Heading>
          <HStack>
            <Text className="text-primary-100 text-sm">
              {genre.songCount > 1
                ? `${genre.songCount} songs`
                : `${genre.songCount} song`}
            </Text>
            <Text className="text-primary-100 text-sm"> ⦁ </Text>
            <Text className="text-primary-100 text-sm">
              {genre.albumCount > 1
                ? `${genre.albumCount} albums`
                : `${genre.albumCount} album`}
            </Text>
          </HStack>
        </VStack>
      </Pressable>
    </Link>
  );
}
