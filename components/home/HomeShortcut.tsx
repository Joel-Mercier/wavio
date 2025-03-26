import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Link } from "expo-router";
import Animated from "react-native-reanimated";
import { Pressable } from "../ui/pressable";

export default function HomeShortcut() {
  return (
    <Link href="/playlists/ioPvinHgxnkBtdrCEuCYdp" asChild>
      <Pressable className="flex-1">
        {({ pressed }) => (
          <Animated.View
            className="flex-row transition duration-100 items-center rounded-md bg-primary-600 overflow-hidden"
            style={{
              transform: [{ scale: pressed ? 0.95 : 1 }],
              opacity: pressed ? 0.5 : 1,
            }}
          >
            <Image
              source={require("@/assets/images/covers/gunship-unicorn.jpg")}
              className="w-16 h-16 aspect-square"
              alt="cover"
            />
            <Box>
              <Heading
                numberOfLines={2}
                size="sm"
                className="text-white font-bold mx-2"
              >
                Favorite tracks
              </Heading>
            </Box>
          </Animated.View>
        )}
      </Pressable>
    </Link>
  );
}
