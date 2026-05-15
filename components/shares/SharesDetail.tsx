import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ShareListItem from "@/components/shares/ShareListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { useGetShares } from "@/hooks/backend/useSharing";
import type { Share } from "@/services/openSubsonic/types";
import { loadingData } from "@/utils/loadingData";
import EmptyDisplay from "../EmptyDisplay";
import { FLOATING_PLAYER_HEIGHT } from "../FloatingPlayer";
import ShareListItemSkeleton from "./ShareListItemSkeleton";

export default function SharesDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const { data, isLoading, error } = useGetShares();
  return (
    <Box className="px-6 mt-6 pb-6 h-full">
      <HStack className="items-center mb-6" style={{ paddingTop: insets.top }}>
        <FadeOutScaleDown onPress={() => router.back()}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white ml-4" size="lg">
          {t("app.shares.title")}
        </Heading>
        <Box className="w-10" />
      </HStack>
      {error && <ErrorDisplay error={error} />}
      {!error && (
        <FlashList
          data={!data ? loadingData(16) : data?.shares.share || []}
          renderItem={({ item }: { item: Share }) =>
            !data ? <ShareListItemSkeleton /> : <ShareListItem share={item} />
          }
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
          ListEmptyComponent={() => <EmptyDisplay />}
        />
      )}
    </Box>
  );
}
