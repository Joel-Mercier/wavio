import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { type RefObject, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SortableBadgeWrap from "@/components/SortableBadgeWrap";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { useHomeSectionAvailability } from "@/hooks/useHomeSectionAvailability";
import useApp from "@/stores/app";
import {
  availableHomeSections,
  type HomeSectionCatalogEntry,
  orderHomeSectionEntries,
  reorderHomeSectionKeys,
} from "@/utils/homeFeed";
import { cn } from "@/utils/tailwind";

// A drop lands on touch-up, the same event the badge's own press would fire on.
// RNGH cancels the underlying pressable when the pan activates, but this makes
// the guard explicit rather than relying on that ordering.
const PRESS_AFTER_DRAG_GRACE_MS = 300;

// The badge area takes the height the pinned text and reset link leave over, so
// it can scroll itself — and auto-scroll while a badge is being dragged.
const BADGE_AREA_STYLE = { flex: 1 } as const;

/** Multi-select and ordering of the sections shown on the home screen. */
export default function HomeSectionsSheet({
  modalRef,
}: {
  modalRef: RefObject<BottomSheetModal | null>;
}) {
  const { t } = useTranslation();
  const hiddenHomeSections = useApp((store) => store.hiddenHomeSections);
  const setHiddenHomeSections = useApp((store) => store.setHiddenHomeSections);
  const homeSectionOrder = useApp((store) => store.homeSectionOrder);
  const setHomeSectionOrder = useApp((store) => store.setHomeSectionOrder);
  const availability = useHomeSectionAvailability();
  const insets = useSafeAreaInsets();
  const dragRef = useRef({ dragging: false, endedAt: 0 });

  const sections = useMemo(
    () =>
      orderHomeSectionEntries(
        availableHomeSections(availability),
        homeSectionOrder,
      ),
    [availability, homeSectionOrder],
  );

  const handleToggleSection = (key: string) => {
    const { dragging: isDragging, endedAt } = dragRef.current;
    if (isDragging || Date.now() - endedAt < PRESS_AFTER_DRAG_GRACE_MS) return;
    setHiddenHomeSections(
      hiddenHomeSections.includes(key)
        ? hiddenHomeSections.filter((current) => current !== key)
        : [...hiddenHomeSections, key],
    );
  };

  const handleDragStateChange = useCallback((isDragging: boolean) => {
    dragRef.current = {
      dragging: isDragging,
      endedAt: isDragging ? 0 : Date.now(),
    };
  }, []);

  // A sheet dismissed mid-drag (hardware back, backdrop tap) never reaches
  // `onDragStateChange(false)`, and the ref outlives the sheet — so without
  // this the guard stays latched and every badge tap is swallowed on reopen.
  const handleDismiss = useCallback(() => {
    dragRef.current = { dragging: false, endedAt: 0 };
  }, []);

  const handleSort = (fromIndex: number, toIndex: number) => {
    setHomeSectionOrder(
      reorderHomeSectionKeys(
        homeSectionOrder,
        sections.map((entry) => entry.key),
        fromIndex,
        toIndex,
      ),
    );
  };

  // Ordinals over the enabled sections, not over feed rows: the dynamic kinds
  // (more from artist, songs by genre) emit several rows under one key, so a
  // number says where the section sits in the order, not which row it renders as.
  const positions = useMemo(() => {
    const byKey = new Map<string, number>();
    let position = 0;
    for (const entry of sections) {
      if (hiddenHomeSections.includes(entry.key)) continue;
      position += 1;
      byKey.set(entry.key, position);
    }
    return byKey;
  }, [sections, hiddenHomeSections]);

  const renderBadge = (entry: HomeSectionCatalogEntry) => {
    const position = positions.get(entry.key);
    return (
      <FadeOutScaleDown onPress={() => handleToggleSection(entry.key)}>
        <Badge
          className={cn("rounded-full bg-gray-800 px-4 py-1", {
            "bg-emerald-500": position !== undefined,
          })}
        >
          {position !== undefined && (
            <BadgeText className="normal-case text-md text-white opacity-70 mr-1">
              {position}
            </BadgeText>
          )}
          <BadgeText className="normal-case text-md text-white">
            {t(entry.labelKey)}
          </BadgeText>
        </Badge>
      </FadeOutScaleDown>
    );
  };

  return (
    <CenteredBottomSheetModal
      ref={modalRef}
      snapPoints={["75%"]}
      enableDynamicSizing={false}
      onDismiss={handleDismiss}
      // The badges own the drag gesture; leaving the sheet's content panning on
      // would let a horizontal-ish drag slide the whole sheet instead. The
      // handle still drags it.
      enableContentPanningGesture={false}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      {/* A fixed column rather than one long scroll: the badge area owns the
          only scroller, which is what lets a drag auto-scroll it. */}
      <Box
        className="px-6 pt-6 w-full flex-1"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <Heading className="text-white" size="lg">
          {t("app.settings.displaySettings.homeSectionsSheetTitle")}
        </Heading>
        <Text className="text-primary-100 text-sm mt-2">
          {t("app.settings.displaySettings.homeSectionsSheetDescription")}
        </Text>
        <Text className="text-primary-100 text-sm mt-1 mb-4">
          {t("app.settings.displaySettings.homeSectionsReorderHint")}
        </Text>
        <SortableBadgeWrap
          data={sections}
          keyExtractor={(entry) => entry.key}
          renderBadge={renderBadge}
          onSort={handleSort}
          onDragStateChange={handleDragStateChange}
          style={BADGE_AREA_STYLE}
        />
        {homeSectionOrder.length > 0 && (
          <Box className="mt-6 items-start">
            <FadeOutScaleDown onPress={() => setHomeSectionOrder([])}>
              <Text className="text-emerald-500 font-bold">
                {t("app.settings.displaySettings.homeSectionsResetOrder")}
              </Text>
            </FadeOutScaleDown>
          </Box>
        )}
      </Box>
    </CenteredBottomSheetModal>
  );
}
