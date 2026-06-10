import { LinearGradient } from "expo-linear-gradient";
import type { Href } from "expo-router";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import Radio from "lucide-react-native/dist/esm/icons/radio.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
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
  const { t } = useTranslation();
  const [blue500, emerald500] = Uniwind.getCSSVariable([
    "--color-blue-500",
    "--color-emerald-500",
  ]) as string[];
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
          imageUrl: recentPlay.coverArt,
          tags: recentPlay.tags,
          country: recentPlay.country,
          countrySubdivision: recentPlay.countrySubdivision,
          languages: recentPlay.languages,
          source: recentPlay.source,
        },
      };
    }
    return "/(app)/(tabs)/(home)";
  }, [recentPlay]);

  return (
    <FadeOutScaleDown href={href} className="w-1/2">
      <HStack className="items-center rounded-md bg-primary-600 overflow-hidden">
        <ImageWithFallback
          size="none"
          source={
            recentPlay.coverArt
              ? {
                  uri:
                    recentPlay.type === "internetRadioStation"
                      ? recentPlay.coverArt
                      : artworkUrl(recentPlay.coverArt),
                }
              : undefined
          }
          className="w-16 h-16 aspect-square"
          alt="Home shortcut cover"
          fallback={
            <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
              {recentPlay.type === "favorites" ? (
                <LinearGradient
                  colors={[blue500, emerald500]}
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
          }
        />

        <Box className="flex-1">
          <Heading
            numberOfLines={2}
            ellipsizeMode="tail"
            size="sm"
            className="text-white font-bold mx-2"
          >
            {recentPlay.type === "favorites"
              ? t("app.favorites.title")
              : recentPlay.title}
          </Heading>
        </Box>
      </HStack>
    </FadeOutScaleDown>
  );
}
