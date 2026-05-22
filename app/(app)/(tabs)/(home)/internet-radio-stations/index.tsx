import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import InternetRadioStationListItem from "@/components/internetRadioStations/InternetRadioStationListItem";
import InternetRadioStationListItemSkeleton from "@/components/internetRadioStations/InternetRadioStationListItemSkeleton";
import { Box } from "@/components/ui/box";
import { useGetInternetRadioStations } from "@/hooks/backend/useInternetRadioStations";
import type { InternetRadioStation } from "@/services/openSubsonic/types";
import { loadingData } from "@/utils/loadingData";

export default function InternetRadioStationsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { data, isLoading, error } = useGetInternetRadioStations();
  const stations = data?.internetRadioStations?.internetRadioStation ?? [];

  return (
    <Box className="h-full">
      <HomeTabsNav active="internetRadioStations" />
      {error ? (
        <ErrorDisplay error={error} />
      ) : (
        <FlashList
          data={isLoading ? loadingData(12) : stations}
          renderItem={({
            item,
            index,
          }: {
            item: InternetRadioStation;
            index: number;
          }) =>
            isLoading ? (
              <InternetRadioStationListItemSkeleton />
            ) : (
              <InternetRadioStationListItem
                internetRadioStation={item}
                index={index}
                layout="vertical"
              />
            )
          }
          keyExtractor={(item, index) =>
            (item as InternetRadioStation)?.id ?? String(index)
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom:
              tabBarHeight + FLOATING_PLAYER_HEIGHT + insets.bottom * 2 + 16,
          }}
          ListEmptyComponent={() => <EmptyDisplay />}
        />
      )}
    </Box>
  );
}
