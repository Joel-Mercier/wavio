import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ShareListItem from "@/components/shares/ShareListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { useGetShares } from "@/hooks/openSubsonic/useSharing";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

export default function SharesScreen() {
  const router = useRouter();
  const { data, isLoading, error } = useGetShares();
  return (
    <SafeAreaView className="h-full">
      <Box className="px-6 mt-6 mb-4 h-full">
        <FlashList
          data={data?.shares.share}
          renderItem={({ item }) => <ShareListItem share={item} />}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <>
              <HStack className="items-center mb-6">
                <FadeOutScaleDown onPress={() => router.back()}>
                  <ArrowLeft size={24} color="white" />
                </FadeOutScaleDown>
                <Heading className="text-white ml-4" size="xl">
                  Shares
                </Heading>
              </HStack>
              {isLoading && <Spinner size="large" />}
              {error && <ErrorDisplay error={error} />}
            </>
          }
        />
      </Box>
    </SafeAreaView>
  );
}
