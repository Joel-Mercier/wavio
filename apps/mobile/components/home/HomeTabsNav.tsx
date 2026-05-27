import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView as RNScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Badge, BadgeText } from "@/components/ui/badge";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";

type ActiveTab =
  | "music"
  | "podcasts"
  | "favoritePodcasts"
  | "internetRadioStations";

interface HomeTabsNavProps {
  active: ActiveTab;
}

// Persist horizontal scroll across screen navigations within the home tab.
let persistedScrollX = 0;

export default function HomeTabsNav({ active }: HomeTabsNavProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const username = useAuth((store) => store.username);
  const isJellyfin = useAuth((store) => store.serverType === "jellyfin");
  const scrollRef = useRef<RNScrollView>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    persistedScrollX = e.nativeEvent.contentOffset.x;
  };

  const showPodcastsSplit =
    active === "podcasts" || active === "favoritePodcasts";

  return (
    <HStack
      className="pl-6 gap-x-4 my-6 items-center"
      style={{ paddingTop: insets.top }}
    >
      <FadeOutScaleDown onPress={() => setShowDrawer(true)}>
        <Avatar className="border-emerald-500 border-2 w-10 h-10">
          <AvatarFallbackText className="font-body ">
            {username}
          </AvatarFallbackText>
        </Avatar>
      </FadeOutScaleDown>
      <HStack className="flex-1 items-center relative">
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: persistedScrollX, y: 0 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingRight: 24 }}
        >
          <HStack className="items-center ml-4">
            <FadeOutScaleDown
              onPress={() => router.navigate("/(app)/(tabs)/(home)")}
            >
              <Badge
                className={`rounded-full ${active === "music" ? "bg-emerald-500" : "bg-gray-800"} px-4 py-1 mr-2`}
              >
                <BadgeText className="normal-case text-md text-white">
                  {t("app.home.tabs.music")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
            {showPodcastsSplit ? (
              <Badge className="p-0 bg-transparent">
                <FadeOutScaleDown
                  onPress={() =>
                    router.navigate("/(app)/(tabs)/(home)/podcasts")
                  }
                >
                  <Badge className="rounded-full rounded-r-none bg-emerald-500 px-4 py-1 pr-4">
                    <BadgeText className="normal-case text-md text-white">
                      {t("app.home.tabs.podcasts")}
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
                <FadeOutScaleDown
                  onPress={() =>
                    router.navigate("/(app)/(tabs)/(home)/favorite-podcasts")
                  }
                >
                  <Badge
                    className={`rounded-full rounded-l-none ${active === "favoritePodcasts" ? "bg-emerald-600" : "bg-gray-800"} text-primary-800 px-4 py-1 mr-2`}
                  >
                    <BadgeText className="normal-case text-md text-white">
                      {t("app.home.tabs.favoritePodcasts")}
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
              </Badge>
            ) : (
              <FadeOutScaleDown
                onPress={() => router.navigate("/(app)/(tabs)/(home)/podcasts")}
              >
                <Badge className="rounded-full bg-gray-800 px-4 py-1 mr-2">
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.home.tabs.podcasts")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
            )}
            {!isJellyfin && (
              <FadeOutScaleDown
                onPress={() =>
                  router.navigate(
                    "/(app)/(tabs)/(home)/internet-radio-stations",
                  )
                }
              >
                <Badge
                  className={`rounded-full ${active === "internetRadioStations" ? "bg-emerald-500" : "bg-gray-800"} px-4 py-1 mr-2`}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.home.tabs.internetRadioStations")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
            )}
          </HStack>
        </ScrollView>
        <LinearGradient
          colors={["#000000", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 16,
          }}
        />
      </HStack>
    </HStack>
  );
}
