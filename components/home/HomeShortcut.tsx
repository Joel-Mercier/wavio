import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { themeConfig } from "@/config/theme";
import type { RecentPlay } from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { LinearGradient } from "expo-linear-gradient";
import type { Href } from "expo-router";
import { Disc3, Heart, ListMusic, User } from "lucide-react-native";
import { useMemo } from "react";

interface HomeShortcutProps {
  recentPlay: RecentPlay;
}

function HomeShortcutIcon({ type }: { type: RecentPlay["type"] }) {
  switch (type) {
    case "album":
      return <Disc3 size={24} color="white" />;
    case "artist":
      return <User size={24} color="white" />;
    case "playlist":
      return <ListMusic size={24} color="white" />;
    case "favorites":
      return <Heart size={24} color="white" fill="white" />;
  }
}

export default function HomeShortcut({ recentPlay }: HomeShortcutProps) {
  const href = useMemo<Href>(() => {
    if (recentPlay.type === "artist") {
      return `/(tabs)/(home)/artists/${recentPlay.id}`;
    }
    if (recentPlay.type === "album") {
      return `/(tabs)/(home)/albums/${recentPlay.id}`;
    }
    if (recentPlay.type === "playlist") {
      return `/(tabs)/(home)/playlists/${recentPlay.id}`;
    }
    if (recentPlay.type === "favorites") {
      return "/(tabs)/(library)/favorites";
    }
  }, [recentPlay]);
  return (
    <FadeOutScaleDown href={href} className="flex-0.5 w-1/2">
      <HStack className="items-center rounded-md bg-primary-600 overflow-hidden">
        {recentPlay.coverArt ? (
          <Image
            source={{ uri: artworkUrl(recentPlay.coverArt) }}
            className="w-16 h-16 aspect-square"
            alt="Home shortcut cover"
          />
        ) : (
          <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
            {recentPlay.type === "favorites" ? (
              <LinearGradient
                colors={[
                  themeConfig.theme.colors.blue[500],
                  themeConfig.theme.colors.emerald[500],
                ]}
                className="w-full h-full items-center justify-center"
              >
                <HomeShortcutIcon type={recentPlay.type} />
              </LinearGradient>
            ) : (
              <HomeShortcutIcon type={recentPlay.type} />
            )}
          </Box>
        )}

        <Box>
          <Heading
            numberOfLines={2}
            size="sm"
            className="text-white font-bold mx-2"
          >
            {recentPlay.title}
          </Heading>
        </Box>
      </HStack>
    </FadeOutScaleDown>
  );
}
