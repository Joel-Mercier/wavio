import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ListMusic } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { usePlaylists } from "@/hooks/openSubsonic/usePlaylists";
import { useGetUser } from "@/hooks/openSubsonic/useUsers";
import type { Playlist } from "@/services/openSubsonic/types";
import useAuth from "@/stores/auth";
import { artworkUrl } from "@/utils/artwork";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

function PlaylistRow({ playlist }: { playlist: Playlist }) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  return (
    <FadeOutScaleDown href={`/playlists/${playlist.id}`} className="px-6 py-2">
      <HStack className="items-center gap-x-4">
        {playlist.coverArt ? (
          <Image
            source={{ uri: artworkUrl(playlist.coverArt) }}
            className="w-14 h-14 rounded-md"
            alt="Playlist cover"
          />
        ) : (
          <Box className="w-14 h-14 rounded-md bg-primary-600 items-center justify-center">
            <ListMusic size={28} color={white} />
          </Box>
        )}
        <VStack className="flex-1">
          <Heading size="sm" className="text-white" numberOfLines={1}>
            {playlist.name}
          </Heading>
          <Text className="text-sm text-primary-100" numberOfLines={1}>
            {t("app.shared.songCount", { count: playlist.songCount ?? 0 })}
          </Text>
        </VStack>
      </HStack>
    </FadeOutScaleDown>
  );
}

export default function ProfileScreen() {
  const [blue500, white] = Uniwind.getCSSVariable([
    "--color-blue-500",
    "--color-white",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { username } = useLocalSearchParams<{ username: string }>();
  const currentUsername = useAuth((store) => store.username);
  const isCurrentUser = username === currentUsername;
  const { data: userData, error } = useGetUser(username);
  const { data: playlistsData } = usePlaylists({ username });
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offsetY.value, [0, 100], [0, 1], Extrapolation.CLAMP),
  }));
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });

  const playlists = playlistsData?.playlists?.playlist ?? [];
  const displayName = userData?.user?.username ?? username;

  return (
    <Box className="h-full">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient colors={[blue500, "#000"]} locations={[0, 0.7]}>
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white font-bold text-center truncate flex-1"
              size="lg"
            >
              {displayName}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        data={playlists}
        renderItem={({ item }: { item: Playlist }) => (
          <PlaylistRow playlist={item} />
        )}
        ListHeaderComponent={() => (
          <>
            <LinearGradient
              colors={[blue500, "#000000"]}
              className="h-64"
              style={{ height: 256 }}
            >
              <Box
                className="bg-black/25 flex-1"
                style={{ paddingTop: insets.top }}
              >
                <VStack className="mt-6 px-6 h-full">
                  <FadeOutScaleDown onPress={() => router.back()}>
                    <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                      <ArrowLeft size={24} color={white} />
                    </Box>
                  </FadeOutScaleDown>
                  <HStack className="mt-6 items-center gap-x-4">
                    <Avatar className="bg-primary-400 w-24 h-24">
                      <AvatarFallbackText className="font-body text-3xl">
                        {displayName}
                      </AvatarFallbackText>
                    </Avatar>
                    <Heading
                      numberOfLines={2}
                      className="text-white font-bold flex-1"
                      size="2xl"
                    >
                      {displayName}
                    </Heading>
                  </HStack>
                  {isCurrentUser && (
                    <HStack className="mt-4">
                      <FadeOutScaleDown
                        onPress={() =>
                          router.navigate(`/profile/${username}/edit`)
                        }
                        className="items-center justify-center py-2 px-6 border border-white rounded-full"
                      >
                        <Text className="text-white font-bold">
                          {t("app.profile.edit")}
                        </Text>
                      </FadeOutScaleDown>
                    </HStack>
                  )}
                </VStack>
              </Box>
            </LinearGradient>
            <VStack className="px-6 mt-6 mb-2">
              <Heading size="lg" className="text-white">
                {t("app.profile.playlists")}
              </Heading>
            </VStack>
            {error && (
              <Box className="px-6">
                <ErrorDisplay error={error} />
              </Box>
            )}
          </>
        )}
        ListEmptyComponent={() => <EmptyDisplay />}
        contentContainerStyle={{
          paddingBottom: insets.bottom + FLOATING_PLAYER_HEIGHT,
        }}
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}
