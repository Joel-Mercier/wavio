import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import Search from "lucide-react-native/icons/search";
import X from "lucide-react-native/icons/x";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AudiobookCard from "@/components/audiobooks/AudiobookCard";
import AudiobookShelfRow from "@/components/audiobooks/AudiobookShelfRow";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useAbsProgressMap,
  useAbsSearch,
} from "@/hooks/audiobookshelf/useAudiobookshelf";
import useDebounce from "@/hooks/useDebounce";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { absAuthorName, absTitle } from "@/utils/audiobookToTrack";
import { goBackOrHome } from "@/utils/navigation";

export default function AudiobookSearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const [primary50, primary100, emerald500] = Uniwind.getCSSVariable([
    "--color-primary-50",
    "--color-primary-100",
    "--color-emerald-500",
  ]) as string[];
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const debounce = useDebounce(400);
  const { data, isFetching, error } = useAbsSearch(debouncedTerm);
  const progress = useAbsProgressMap();
  const hasQuery = debouncedTerm.trim().length >= 2;

  const handleChange = (value: string) => {
    setTerm(value);
    debounce(() => setDebouncedTerm(value));
  };

  const handleClear = () => {
    debounce.cancel();
    setTerm("");
    setDebouncedTerm("");
  };

  const books = data?.book ?? [];
  const series = (data?.series ?? []).map((entry) => ({
    ...entry.series,
    books: entry.books,
  }));
  const authors = data?.authors ?? [];
  const empty =
    hasQuery &&
    !isFetching &&
    !error &&
    books.length === 0 &&
    series.length === 0 &&
    authors.length === 0;

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
                placeholder={t("app.audiobooks.searchPlaceholder")}
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
            </Input>
          </HStack>
        </Box>
      </Box>
      <ScrollView
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorDisplay error={error} /> : null}
        {!hasQuery ? (
          <VStack className="items-center px-10 py-16">
            <Text className="text-primary-100 text-center">
              {t("app.audiobooks.searchPrompt")}
            </Text>
          </VStack>
        ) : empty ? (
          <EmptyDisplay />
        ) : (
          <>
            {books.length > 0 && (
              <>
                <Box className="px-6 mt-4 mb-2">
                  <Heading size="xl" className="text-white">
                    {t("app.audiobooks.browse.books")}
                  </Heading>
                </Box>
                {books.map(({ libraryItem }) => (
                  <AudiobookCard
                    key={libraryItem.id}
                    itemId={libraryItem.id}
                    title={absTitle(libraryItem)}
                    subtitle={absAuthorName(libraryItem)}
                    progress={progress.get(libraryItem.id)}
                    layout="vertical"
                  />
                ))}
              </>
            )}
            <AudiobookShelfRow
              title={t("app.audiobooks.browse.series")}
              shelf={{ type: "series", entities: series }}
              progress={progress}
            />
            <AudiobookShelfRow
              title={t("app.audiobooks.browse.authors")}
              shelf={{ type: "authors", entities: authors }}
              progress={progress}
            />
          </>
        )}
        {hasQuery && isFetching && (
          <Box className="py-6">
            <ActivityIndicator color={emerald500} />
          </Box>
        )}
      </ScrollView>
    </Box>
  );
}
