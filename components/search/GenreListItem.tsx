import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import type { Genre } from "@/services/openSubsonic/types";
import { Link } from "expo-router";
import Animated from "react-native-reanimated";
import { Pressable } from "../ui/pressable";

interface GenreListItemProps {
  genre: Genre;
}

export default function GenreListItem({ genre }: GenreListItemProps) {
  return (
    <Link href={`/genres/${genre.value}`} asChild>
      <Pressable>
        {({ pressed }) => (
          <Animated.View
            className="transition duration-100 bg-primary-600 p-4 w-full rounded-md"
            style={{
              transform: [{ scale: pressed ? 0.95 : 1 }],
              opacity: pressed ? 0.5 : 1,
            }}
          >
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
          </Animated.View>
        )}
      </Pressable>
    </Link>
  );
}
