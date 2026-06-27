import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
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
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import type { Share } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";
import EmptyDisplay from "../EmptyDisplay";
import ShareListItemSkeleton from "./ShareListItemSkeleton";

export default function SharesDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
  const isLandscape = useApp((s) => s.isLandscape);
  const { data, isLoading, error } = useGetShares();
  return (
    <Box className={cn("px-6 pb-6 h-full", isLandscape ? "mb-6" : "mt-6")}>
      <HStack
        className="items-center justify-between mb-6"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white text-center flex-1" size="lg">
          {t("app.shares.title")}
        </Heading>
        <Box className="w-6" />
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
              insets.bottom + bottomTabBarHeight + floatingPlayerInset,
          }}
          ListEmptyComponent={() => <EmptyDisplay />}
        />
      )}
    </Box>
  );
}
