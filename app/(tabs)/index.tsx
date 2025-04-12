import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import AlbumListItem from "@/components/albums/AlbumListItem";
import HomeDrawer from "@/components/home/HomeDrawer";
import HomeShortcut from "@/components/home/HomeShortcut";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { VStack } from "@/components/ui/vstack";
import { useAlbumList2 } from "@/hooks/openSubsonic/useLists";
import useRecentPlays from "@/stores/recentPlays";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useState } from "react";

export default function HomeScreen() {
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const tabBarHeight = useBottomTabBarHeight();
  const recentPlays = useRecentPlays.use.recentPlays();
  const {
    data: recentData,
    isLoading: isLoadingRecent,
    error: recentError,
  } = useAlbumList2({ type: "newest", size: 12 });
  const {
    data: mostPlayedData,
    isLoading: isLoadingMostPlayed,
    error: mostPlayedError,
  } = useAlbumList2({ type: "frequent", size: 12 });
  const {
    data: highestRatedData,
    isLoading: isLoadingHighestRated,
    error: highestRatedError,
  } = useAlbumList2({ type: "highest", size: 12 });
  const handleClose = () => setShowDrawer(false);

  return (
    <>
      <Image
        source={require("@/assets/images/home-bg-transparent.png")}
        className="absolute right-0 top-0 w-60 h-60 aspect-square"
        resizeMode="contain"
        alt="home screen background"
      />
      <SafeAreaView>
        <ScrollView contentContainerStyle={{ paddingBottom: tabBarHeight }}>
          <Box className="px-6 mt-6 mb-4">
            <HStack className="gap-x-4 items-center mb-4">
              <FadeOutScaleDown onPress={() => setShowDrawer(true)}>
                <Avatar size="sm" className="border-emerald-500 border-2">
                  <AvatarFallbackText className="font-body ">
                    {process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || ""}
                  </AvatarFallbackText>
                </Avatar>
              </FadeOutScaleDown>
              <Heading size="2xl" className="text-white font-bold">
                Hi {process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || ""}
              </Heading>
            </HStack>
            <VStack className="gap-y-4">
              {recentPlays.reduce((rows: JSX.Element[], play, index) => {
                if (index % 2 === 0) {
                  rows.push(
                    <HStack key={`row-${index}`} className="gap-x-4">
                      <HomeShortcut key={play.id} recentPlay={play} />
                      {recentPlays[index + 1] && (
                        <HomeShortcut
                          key={recentPlays[index + 1].id}
                          recentPlay={recentPlays[index + 1]}
                        />
                      )}
                    </HStack>,
                  );
                }
                return rows;
              }, [])}
            </VStack>
          </Box>
          <Box className="px-6 mt-4 mb-4">
            <Heading size="xl" className="text-white">
              Recently added
            </Heading>
          </Box>
          {recentError ? (
            <ErrorDisplay error={recentError} />
          ) : (
            <>
              {isLoadingRecent ? (
                <Spinner size="large" />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="pl-6 mb-6"
                >
                  {recentData?.albumList2?.album?.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}
          {!isLoadingRecent &&
            !recentError &&
            !recentData?.albumList2?.album?.length && <EmptyDisplay />}
          <Box className="px-6 mt-4 mb-4">
            <Heading size="xl" className="text-white">
              Most played
            </Heading>
          </Box>
          {mostPlayedError ? (
            <ErrorDisplay error={mostPlayedError} />
          ) : (
            <>
              {isLoadingMostPlayed ? (
                <Spinner size="large" />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="pl-6 mb-6"
                >
                  {mostPlayedData?.albumList2?.album?.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}
          {!isLoadingMostPlayed &&
            !mostPlayedError &&
            !mostPlayedData?.albumList2?.album?.length && <EmptyDisplay />}
          <Box className="px-6 mt-4 mb-4">
            <Heading size="xl" className="text-white">
              Top rated
            </Heading>
          </Box>
          {highestRatedError ? (
            <ErrorDisplay error={highestRatedError} />
          ) : (
            <>
              {isLoadingHighestRated ? (
                <Spinner size="large" />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="pl-6 mb-6"
                >
                  {highestRatedData?.albumList2?.album?.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}
          {!isLoadingHighestRated &&
            !highestRatedError &&
            !highestRatedData?.albumList2?.album?.length && <EmptyDisplay />}
        </ScrollView>
      </SafeAreaView>
      <HomeDrawer onClose={handleClose} showDrawer={showDrawer} />
    </>
  );
}
