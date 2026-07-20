import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { Redirect, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import Settings2 from "lucide-react-native/dist/esm/icons/settings-2.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import DiscoveryFiltersSheet from "@/components/downloaders/lidarr/DiscoveryFiltersSheet";
import LidarrAlbumRow from "@/components/downloaders/lidarr/LidarrAlbumRow";
import LidarrArtistRow from "@/components/downloaders/lidarr/LidarrArtistRow";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useLidarrSearch } from "@/hooks/lidarr/useLidarrSearch";
import useDebounce from "@/hooks/useDebounce";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { LidarrSearchResult } from "@/services/lidarr/types";
import useLidarr from "@/stores/lidarr";
import { goBackOrHome } from "@/utils/navigation";

export default function DiscoveryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const screenBottomPadding = useScreenBottomPadding();
  const [primary50, primary100, emerald500] = Uniwind.getCSSVariable([
    "--color-primary-50",
    "--color-primary-100",
    "--color-emerald-500",
  ]) as string[];
  const isConnected = useLidarr((store) => store.isConnected);

  const filtersSheetRef = useRef<BottomSheetModal>(null);
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const debounce = useDebounce(400);

  const { data, isLoading, error } = useLidarrSearch(debouncedTerm);

  if (!isConnected) {
    return <Redirect href="/downloaders/lidarr" />;
  }

  const handleChange = (value: string) => {
    setTerm(value);
    debounce(() => setDebouncedTerm(value));
  };

  const handleClear = () => {
    setTerm("");
    setDebouncedTerm("");
  };

  const handleFiltersPress = () => {
    KeyboardController.dismiss();
    filtersSheetRef.current?.present();
  };

  const hasQuery = debouncedTerm.trim().length >= 2;
  const results = data ?? [];

  return (
    <Box className="h-full">
      <Box className="bg-primary-600 px-6 py-6">
        <Box style={{ paddingTop: insets.top }}>
          <HStack className="items-center">
            <FadeOutScaleDown
              className="mr-4"
              onPress={() => goBackOrHome(router)}
            >
              <ArrowLeft size={24} color="white" />
            </FadeOutScaleDown>
            <Input className="flex-1 border-0">
              <InputSlot className="pl-1 pr-2">
                <InputIcon as={Search} color={primary100} size="lg" />
              </InputSlot>
              <InputField
                disableFullscreenUI
                className="text-white text-xl"
                placeholder={t(
                  "app.settings.downloaders.discovery.inputPlaceholder",
                )}
                placeholderTextColor={primary50}
                value={term}
                onChangeText={handleChange}
                enterKeyHint="search"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {term.length > 0 && (
                <InputSlot className="pr-3" onPress={handleClear}>
                  <InputIcon as={X} size="xl" />
                </InputSlot>
              )}
              <InputSlot className="pr-1" onPress={handleFiltersPress}>
                <InputIcon as={Settings2} color={primary100} size="xl" />
              </InputSlot>
            </Input>
          </HStack>
        </Box>
      </Box>

      <FlashList
        data={results}
        keyExtractor={(item) => `${item.id}-${item.foreignId}`}
        renderItem={({ item }: { item: LidarrSearchResult }) =>
          item.album ? (
            <LidarrAlbumRow album={item.album} />
          ) : item.artist ? (
            <LidarrArtistRow artist={item.artist} />
          ) : null
        }
        ListHeaderComponent={error ? <ErrorDisplay error={error} /> : null}
        ListEmptyComponent={
          hasQuery && !isLoading ? (
            <EmptyDisplay />
          ) : !hasQuery ? (
            <VStack className="items-center px-10 py-16">
              <Text className="text-primary-100 text-center">
                {t("app.settings.downloaders.discovery.emptyPrompt")}
              </Text>
            </VStack>
          ) : null
        }
        ListFooterComponent={
          hasQuery && isLoading ? (
            <Box className="py-6">
              <ActivityIndicator color={emerald500} />
            </Box>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      <DiscoveryFiltersSheet sheetRef={filtersSheetRef} />
    </Box>
  );
}
