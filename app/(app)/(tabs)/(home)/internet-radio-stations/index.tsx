import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import InternetRadioStationListItem from "@/components/internetRadioStations/InternetRadioStationListItem";
import InternetRadioStationListItemSkeleton from "@/components/internetRadioStations/InternetRadioStationListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { useGetInternetRadioStations } from "@/hooks/openSubsonic/useInternetRadioStations";
import type { InternetRadioStation } from "@/services/openSubsonic/types";
import { loadingData } from "@/utils/loadingData";

export default function InternetRadioStationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { data, isLoading, error } = useGetInternetRadioStations();
  const stations = data?.internetRadioStations?.internetRadioStation ?? [];

  return (
    <Box className="h-full">
      <HStack
        className="px-6 items-center mb-4"
        style={{ paddingTop: insets.top + 16 }}
      >
        <FadeOutScaleDown onPress={() => router.back()}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white text-center truncate flex-1" size="lg">
          {t("app.home.internetRadioStations")}
        </Heading>
        <Box className="w-6" />
      </HStack>
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
