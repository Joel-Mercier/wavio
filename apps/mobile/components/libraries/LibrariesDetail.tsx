import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import LibraryRow from "@/components/libraries/LibraryRow";
import LibraryListItemSkeleton from "@/components/library/LibraryListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import useApplyMusicFolderSelection from "@/hooks/useApplyMusicFolderSelection";
import { useIsOnline } from "@/hooks/useIsOnline";
import useLibraryPicker, { musicFolderLabel } from "@/hooks/useLibraryPicker";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { MusicFolder } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import type { MusicFolderSelection } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";
import {
  sameMusicFolderSelection,
  toggleMusicFolder,
} from "@/utils/musicFolderSelection";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

export default function LibrariesDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const { folders, selection, isLoading, error, multiSelect, allowAll } =
    useLibraryPicker();
  const apply = useApplyMusicFolderSelection();
  // Switching invalidates and refetches every folder-scoped query, which needs
  // the server — offline it would just blank the library, so keep the current
  // selection until the server is reachable again.
  const isOnline = useIsOnline();
  // Multi-select ticks are applied once, when the screen goes away, so a few
  // taps cost one refetch.
  const [draft, setDraft] = useState<{ ids: MusicFolderSelection } | null>(
    null,
  );
  const changed =
    draft && !sameMusicFolderSelection(draft.ids, selection) ? draft : null;
  const pending = useRef(changed);
  useEffect(() => {
    pending.current = changed;
  }, [changed]);
  useEffect(
    () => () => {
      if (pending.current) apply(pending.current.ids);
    },
    [apply],
  );
  const shown = draft ? draft.ids : selection;
  const allIds = folders.map((f) => String(f.id));

  const choose = (ids: MusicFolderSelection) => {
    if (multiSelect) {
      setDraft({ ids });
      return;
    }
    apply(ids);
    goBackOrHome(router);
  };

  return (
    <Box className={cn("px-6 pb-6 h-full", isWideLayout ? "mb-6" : "mt-6")}>
      <HStack
        className="items-center justify-between mb-6"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white text-center flex-1" size="lg">
          {t("app.libraries.title")}
        </Heading>
        <Box className="w-6" />
      </HStack>
      {multiSelect && !isLoading && folders.length > 1 && (
        <Text className="text-sm text-primary-100 mb-4">
          {t("app.libraries.pickOneOrMore")}
        </Text>
      )}
      {error && <ErrorDisplay error={error} />}
      {!error && (
        <LegendList
          recycleItems
          data={
            isLoading ? (loadingData(6) as unknown as MusicFolder[]) : folders
          }
          ListHeaderComponent={
            isLoading || !allowAll ? null : (
              <LibraryRow
                label={t("app.libraries.allLibraries")}
                isSelected={shown === undefined}
                disabled={!isOnline}
                onPress={() => choose(undefined)}
              />
            )
          }
          renderItem={({
            item,
            index,
          }: {
            item: MusicFolder;
            index: number;
          }) =>
            isLoading ? (
              <LibraryListItemSkeleton layout="list" />
            ) : (
              <LibraryRow
                label={musicFolderLabel(item)}
                isDefault={index === 0}
                isSelected={shown?.includes(String(item.id)) ?? false}
                disabled={!isOnline}
                onPress={() =>
                  choose(
                    multiSelect
                      ? toggleMusicFolder(shown, String(item.id), allIds)
                      : [String(item.id)],
                  )
                }
              />
            )
          }
          keyExtractor={(item, index) =>
            isLoading ? `skeleton-${index}` : String(item.id)
          }
          extraData={shown}
          contentContainerStyle={{
            paddingBottom: screenBottomPadding,
          }}
          ListEmptyComponent={() => (isLoading ? null : <EmptyDisplay />)}
        />
      )}
    </Box>
  );
}
