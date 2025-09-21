import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import HomeShortcut from "@/components/home/HomeShortcut";
import InternetRadioStationListItem from "@/components/internetRadioStations/InternetRadioStationListItem";
import InternetRadioStationListItemSkeleton from "@/components/internetRadioStations/InternetRadioStationListItemSkeleton";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { ScrollView } from "@/components/ui/scroll-view";
import { VStack } from "@/components/ui/vstack";
import { useGetInternetRadioStations } from "@/hooks/openSubsonic/useInternetRadioStations";
import { useAlbumList2 } from "@/hooks/openSubsonic/useLists";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import useRecentPlays from "@/stores/recentPlays";
import { loadingData } from "@/utils/loadingData";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HomeScreen() {
  const setShowDrawer = useApp.use.setShowDrawer();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const recentPlays = useRecentPlays.use.recentPlays();
  const username = useAuth.use.username();
  const {
    data: recentlyPlayedData,
    isLoading: isLoadingRecentlyPlayed,
    error: recentlyPlayedError,
  } = useAlbumList2({ type: "recent", size: 12 });
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
  const {
    data: internetRadioStationsData,
    isLoading: isLoadingInternetRadioStations,
    error: internetRadioStationsError,
  } = useGetInternetRadioStations();
  return (
    <Box>
      <Image
        source={require("@/assets/images/home-bg-transparent.png")}
        className="absolute right-0 top-0 w-60 h-60 aspect-square"
        resizeMode="contain"
        alt="home screen background"
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: tabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Box className="px-6 mt-6 mb-4">
          <HStack className="gap-x-4 items-center mb-4">
            <FadeOutScaleDown onPress={() => setShowDrawer(true)}>
              <Avatar size="sm" className="border-emerald-500 border-2">
                <AvatarFallbackText className="font-body ">
                  {username}
                </AvatarFallbackText>
              </Avatar>
            </FadeOutScaleDown>
            <Heading size="2xl" className="text-white font-bold">
              Hi {username}
            </Heading>
          </HStack>
          <VStack className="gap-y-4">
            {recentPlays.reduce((rows: JSX.Element[], play, index) => {
              if (index % 2 === 0) {
                rows.push(
                  <HStack key={`row-${play.id}`} className="gap-x-4">
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
            Recently played
          </Heading>
        </Box>
        {recentlyPlayedError ? (
          <ErrorDisplay error={recentlyPlayedError} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="mb-6 pl-6"
          >
            {isLoadingRecentlyPlayed ? (
              loadingData(4).map((_, index) => (
                <AlbumListItemSkeleton
                  key={`recently-played-${index}`}
                  index={index}
                  layout="horizontal"
                />
              ))
            ) : (
              <>
                {recentlyPlayedData?.albumList2?.album?.map((album, index) => (
                  <AlbumListItem
                    key={album.id}
                    album={album}
                    index={index}
                    layout="horizontal"
                  />
                ))}
              </>
            )}
          </ScrollView>
        )}
        {!isLoadingRecentlyPlayed &&
          !recentlyPlayedError &&
          !recentlyPlayedData?.albumList2?.album?.length && <EmptyDisplay />}
        <Box className="px-6 mt-4 mb-4">
          <Heading size="xl" className="text-white">
            Recently added
          </Heading>
        </Box>
        {recentError ? (
          <ErrorDisplay error={recentError} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="pl-6 mb-6"
          >
            {isLoadingRecent ? (
              loadingData(4).map((_, index) => (
                <AlbumListItemSkeleton
                  key={`recently-added-${index}`}
                  index={index}
                  layout="horizontal"
                />
              ))
            ) : (
              <>
                {recentData?.albumList2?.album?.map((album, index) => (
                  <AlbumListItem
                    key={album.id}
                    album={album}
                    index={index}
                    layout="horizontal"
                  />
                ))}
              </>
            )}
          </ScrollView>
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="pl-6 mb-6"
          >
            {isLoadingMostPlayed ? (
              loadingData(4).map((_, index) => (
                <AlbumListItemSkeleton
                  key={`most-played-${index}`}
                  index={index}
                  layout="horizontal"
                />
              ))
            ) : (
              <>
                {mostPlayedData?.albumList2?.album?.map((album, index) => (
                  <AlbumListItem
                    key={album.id}
                    album={album}
                    index={index}
                    layout="horizontal"
                  />
                ))}
              </>
            )}
          </ScrollView>
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="pl-6 mb-6"
          >
            {isLoadingHighestRated ? (
              loadingData(4).map((_, index) => (
                <AlbumListItemSkeleton
                  key={`highest-rated-${index}`}
                  index={index}
                  layout="horizontal"
                />
              ))
            ) : (
              <>
                {highestRatedData?.albumList2?.album?.map((album, index) => (
                  <AlbumListItem
                    key={album.id}
                    album={album}
                    index={index}
                    layout="horizontal"
                  />
                ))}
              </>
            )}
          </ScrollView>
        )}
        {!isLoadingHighestRated &&
          !highestRatedError &&
          !highestRatedData?.albumList2?.album?.length && <EmptyDisplay />}
        <Box className="px-6 mt-4 mb-4">
          <Heading size="xl" className="text-white">
            Internet radio stations
          </Heading>
        </Box>
        {internetRadioStationsError ? (
          <ErrorDisplay error={internetRadioStationsError} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="pl-6 mb-6"
          >
            {isLoadingInternetRadioStations ? (
              loadingData(4).map((_, index) => (
                <InternetRadioStationListItemSkeleton
                  key={`internet-radio-stations-${index}`}
                />
              ))
            ) : (
              <>
                {internetRadioStationsData?.internetRadioStations?.internetRadioStation?.map(
                  (radioStation, index) => (
                    <InternetRadioStationListItem
                      key={radioStation.id}
                      internetRadioStation={radioStation}
                    />
                  ),
                )}
              </>
            )}
          </ScrollView>
        )}
        {!isLoadingInternetRadioStations &&
          !internetRadioStationsError &&
          !internetRadioStationsData?.internetRadioStations
            ?.internetRadioStation?.length && <EmptyDisplay />}
      </ScrollView>
    </Box>
  );
}
