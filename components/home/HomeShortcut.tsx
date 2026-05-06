import { LinearGradient } from "expo-linear-gradient";
import type { Href } from "expo-router";
import { Disc3, Heart, ListMusic, Radio, User } from "lucide-react-native";
import { useMemo, useState } from "react";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { themeConfig } from "@/config/theme";
import type { RecentPlay } from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";

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
    case "internetRadioStation":
      return <Radio size={24} color="white" />;
  }
}

export default function HomeShortcut({ recentPlay }: HomeShortcutProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const href = useMemo<Href>(() => {
    if (recentPlay.type === "artist") {
      return `/artists/${recentPlay.id}`;
    }
    if (recentPlay.type === "album") {
      return `/albums/${recentPlay.id}`;
    }
    if (recentPlay.type === "playlist") {
      return `/playlists/${recentPlay.id}`;
    }
    if (recentPlay.type === "favorites") {
      return "/favorites";
    }
    if (recentPlay.type === "internetRadioStation") {
      return {
        pathname: "/internet-radio-stations/[id]",
        params: {
          id: recentPlay.id,
          homePageUrl: recentPlay.homePageUrl,
          streamUrl: recentPlay.streamUrl,
          name: recentPlay.title,
        },
      };
    }
    return "/(app)/(tabs)/(home)";
  }, [recentPlay]);

  return (
    <FadeOutScaleDown href={href} className="w-1/2">
      <HStack className="items-center rounded-md bg-primary-600 overflow-hidden">
        {recentPlay.coverArt && !imageFailed ? (
          <Image
            size="none"
            source={{
              uri:
                recentPlay.type === "internetRadioStation"
                  ? recentPlay.coverArt
                  : artworkUrl(recentPlay.id),
            }}
            className="w-16 h-16 aspect-square"
            alt="Home shortcut cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
            {recentPlay.type === "favorites" ? (
              <LinearGradient
                colors={[
                  themeConfig.theme.colors.blue[500],
                  themeConfig.theme.colors.emerald[500],
                ]}
                style={{
                  width: "100%",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HomeShortcutIcon type={recentPlay.type} />
              </LinearGradient>
            ) : (
              <HomeShortcutIcon type={recentPlay.type} />
            )}
          </Box>
        )}

        <Box className="flex-1">
          <Heading
            numberOfLines={2}
            ellipsizeMode="tail"
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
