import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import EmptyDisplay from "@/components/EmptyDisplay";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import InternetRadioStationListItem, {
  favoriteToItem,
} from "@/components/internetRadioStations/InternetRadioStationListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import {
  useScopedRadioFavorites,
  useSyncServerRadioFavorites,
} from "@/hooks/useRadioFavorites";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { FavoriteRadioStation } from "@/stores/radioStations";

export default function FavoriteInternetRadioStationsScreen() {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
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
          paddingBottom: screenBottomPadding,
        }}
        ListEmptyComponent={<EmptyDisplay />}
      />
    </Box>
  );
}
