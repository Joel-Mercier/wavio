import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import GenreListItem from "@/components/search/GenreListItem";
import GenreListItemSkeleton from "@/components/search/GenreListItemSkeleton";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { useGenres } from "@/hooks/backend/useBrowsing";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { Genre } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import { gridCellMarginClass, gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { cn } from "@/utils/tailwind";

export default function SearchScreen() {
  const [gray500] = Uniwind.getCSSVariable(["--color-gray-500"]) as string[];
  const { t } = useTranslation();
  const username = useAuth((store) => store.username);
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const isWideLayout = useApp((store) => store.isWideLayout);
  const router = useRouter();
  const screenBottomPadding = useScreenBottomPadding();
  const { data, isLoading, error } = useGenres();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numColumns = gridColumnCount(width, {
    minItemWidth: 220,
    minColumns: 2,
    maxColumns: 4,
  });
  const handleSearchPress = () => {
    router.navigate("/(app)/(tabs)/(search)/recent-searches");
  };

  return (
    <Box className="h-full">
      <HStack
        className={cn("px-6 gap-x-4 items-center", {
          "my-6": !isWideLayout,
          "mb-6": isWideLayout,
        })}
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown
          testID="open-drawer-button"
          onPress={() => setShowDrawer(true)}
        >
          <Avatar className="border-emerald-500 border-2 w-10 h-10">
            <AvatarFallbackText className="font-body ">
              {username}
            </AvatarFallbackText>
          </Avatar>
        </FadeOutScaleDown>
        <Heading className="text-white" size="2xl">
          {t("app.search.title")}
        </Heading>
      </HStack>
      <FadeOutScaleDown className="mx-6 mb-6" onPress={handleSearchPress}>
        <HStack className="bg-white rounded-md py-3 px-3">
          <Search size={22} color={gray500} />
          <Text className="text-gray-500 text-xl ml-4">
            {t("app.search.inputPlaceholder")}
          </Text>
        </HStack>
      </FadeOutScaleDown>
      <FlashList
        key={`genres-${numColumns}`}
        data={data?.genres.genre || loadingData(16)}
        renderItem={({ item, index }: { item: Genre; index: number }) => (
          <Box
            className={cn(
              "flex-1 mb-4",
              gridCellMarginClass(index % numColumns, numColumns),
            )}
          >
            {isLoading ? (
              <GenreListItemSkeleton />
            ) : (
              <GenreListItem genre={item} />
            )}
          </Box>
        )}
        numColumns={numColumns}
        ListHeaderComponent={
          <>
            <Heading size="lg" className="text-white mb-4">
              {t("app.search.exploreGenres")}
            </Heading>
            {error && <ErrorDisplay error={error} />}
          </>
        }
        ListEmptyComponent={<EmptyDisplay />}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}
