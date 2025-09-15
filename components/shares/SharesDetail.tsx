import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ShareListItem from "@/components/shares/ShareListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { useGetShares } from "@/hooks/openSubsonic/useSharing";
import { loadingData } from "@/utils/loadingData";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "../FloatingPlayer";
import ShareListItemSkeleton from "./ShareListItemSkeleton";

export default function SharesDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const { data, isLoading, error } = useGetShares();
  return (
    <Box className="px-6 mt-6 pb-6 h-full">
      <>
        <HStack
          className="items-center mb-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white ml-4" size="xl">
            Shares
          </Heading>
        </HStack>
        {error && <ErrorDisplay error={error} />}
      </>
      {!error && (
        <FlashList
          data={data?.shares.share || loadingData(16)}
          renderItem={({ item }) =>
            isLoading ? (
              <ShareListItemSkeleton />
            ) : (
              <ShareListItem share={item} />
            )
          }
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
        />
      )}
    </Box>
  );
}
