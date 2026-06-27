import { FlashList } from "@shopify/flash-list";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import InternetRadioStationListItem, {
  favoriteToItem,
} from "@/components/internetRadioStations/InternetRadioStationListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import {
  useScopedRadioFavorites,
  useSyncServerRadioFavorites,
} from "@/hooks/useRadioFavorites";
import type { FavoriteRadioStation } from "@/stores/radioStations";

export default function FavoriteInternetRadioStationsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
  const favoriteRadioStations = useScopedRadioFavorites();

  useSyncServerRadioFavorites();

  return (
    <Box className="h-full">
      <HomeTabsNav active="internetRadioStationsFavorites" />
      <FlashList
        data={favoriteRadioStations}
        renderItem={({
          item,
          index,
        }: {
          item: FavoriteRadioStation;
          index: number;
        }) => (
          <InternetRadioStationListItem
            station={favoriteToItem(item)}
            index={index}
            layout="vertical"
          />
        )}
        keyExtractor={(item, index) => item?.id ?? String(index)}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Box className="px-6 mb-2">
            <Heading className="text-white" size="xl">
              {t("app.internetRadioStations.favoritesTitle")}
            </Heading>
          </Box>
        }
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom:
            tabBarHeight + floatingPlayerInset + insets.bottom * 2 + 16,
        }}
        ListEmptyComponent={<EmptyDisplay />}
      />
    </Box>
  );
}
