import { getLocales } from "expo-localization";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import {
  radioBrowserToItem,
  serverToItem,
} from "@/components/internetRadioStations/InternetRadioStationListItem";
import RadioStationRow from "@/components/internetRadioStations/RadioStationRow";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { useGetInternetRadioStations } from "@/hooks/backend/useInternetRadioStations";
import {
  usePopularStations,
  useStationsByCountryCode,
  useStationsByTag,
  useTopVotedStations,
} from "@/hooks/radioBrowser/useRadioBrowser";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useSyncServerRadioFavorites } from "@/hooks/useRadioFavorites";

const POPULAR_TAGS = ["jazz", "rock", "news"];

export default function InternetRadioStationsScreen() {
  const { t } = useTranslation();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const capabilities = useCapabilities();
  const countryCode = useMemo(
    () => getLocales()[0]?.regionCode ?? undefined,
    [],
  );

  useSyncServerRadioFavorites();

  const {
    data: serverData,
    isLoading: isLoadingServer,
    error: serverError,
  } = useGetInternetRadioStations({ enabled: capabilities.internetRadio });
  const serverStations = useMemo(
    () =>
      (serverData?.internetRadioStations?.internetRadioStation ?? []).map(
        serverToItem,
      ),
    [serverData],
  );

  const {
    data: topVoted,
    isLoading: isLoadingTopVoted,
    error: topVotedError,
  } = useTopVotedStations();
  const {
    data: popular,
    isLoading: isLoadingPopular,
    error: popularError,
  } = usePopularStations();
  const {
    data: byCountry,
    isLoading: isLoadingByCountry,
    error: byCountryError,
  } = useStationsByCountryCode({ countryCode });

  return (
    <Box>
      <HomeTabsNav active="internetRadioStations" />
      <ScrollView
        contentContainerStyle={{
          paddingBottom:
            tabBarHeight + FLOATING_PLAYER_HEIGHT + insets.bottom * 2,
        }}
        showsVerticalScrollIndicator={false}
      >
        <FadeOutScaleDown
          href={"/(app)/(tabs)/(home)/internet-radio-stations/search"}
          className="mb-4"
        >
          <HStack className="mx-6 px-4 gap-x-4 h-10 rounded-lg bg-primary-600 items-center">
            <Search
              size={20}
              color={"rgb(128, 128, 128)"}
              className="text-primary-100"
            />
            <Text className="text-primary-100 text-sm">
              {t("app.internetRadioStations.searchPlaceholder")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
        {capabilities.internetRadio && serverStations.length > 0 && (
          <RadioStationRow
            title={t("app.internetRadioStations.yourStations")}
            isLoading={isLoadingServer}
            error={serverError}
            stations={serverStations}
            skeletonKey="your-stations"
          />
        )}
        <RadioStationRow
          title={t("app.internetRadioStations.topVoted")}
          isLoading={isLoadingTopVoted}
          error={topVotedError}
          stations={topVoted?.map(radioBrowserToItem)}
          skeletonKey="top-voted"
        />
        <RadioStationRow
          title={t("app.internetRadioStations.popular")}
          isLoading={isLoadingPopular}
          error={popularError}
          stations={popular?.map(radioBrowserToItem)}
          skeletonKey="popular"
        />
        {countryCode && (
          <RadioStationRow
            title={t("app.internetRadioStations.byCountry")}
            isLoading={isLoadingByCountry}
            error={byCountryError}
            stations={byCountry?.map(radioBrowserToItem)}
            skeletonKey="by-country"
          />
        )}
        {POPULAR_TAGS.map((tag) => (
          <TagRow key={tag} tag={tag} />
        ))}
      </ScrollView>
    </Box>
  );
}

function TagRow({ tag }: { tag: string }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useStationsByTag({ tag });
  const titleizedTag = tag
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return (
    <RadioStationRow
      title={t("app.internetRadioStations.byTag", { tag: titleizedTag })}
      isLoading={isLoading}
      error={error}
      stations={data?.map(radioBrowserToItem)}
      skeletonKey={`tag-${tag}`}
    />
  );
}
