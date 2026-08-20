import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowUp from "lucide-react-native/dist/esm/icons/arrow-up.mjs";
import type { Ref } from "react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  buildSortType,
  parseSortType,
  type SortDirection,
  type SortType,
  toggleSortType,
} from "@/utils/sort";

// The single sort sheet behind every sortable list. Rows come from the caller's
// field list (already filtered by capability + data coverage via
// `availableSortFields`); tapping the active row flips its direction.

export type SortLabels<F extends string> = Partial<Record<F, string>>;

// `fields` is the only inference site for F: `SortType<F>` is a template literal
// that TS would happily infer a single field name from ("durationAsc" → F =
// "duration"), which would then reject the full field list.
type SortOptionsSheetProps<F extends string> = {
  ref?: Ref<BottomSheetModal>;
  fields: F[];
  sort: NoInfer<SortType<F>>;
  onSelect: (sort: NoInfer<SortType<F>>) => void;
  // Overrides the shared `app.shared.sort.<field>` copy, e.g. a playlist calls
  // its `addedAt` row "Playlist order".
  labels?: NoInfer<SortLabels<F>>;
  // Fields the backend can only serve one way, so tapping them picks that
  // direction instead of flipping (a Subsonic album browse can't reverse
  // `alphabeticalByName`). "none" is a field with no direction at all, like a
  // random order: it renders no arrow.
  lockedDirections?: NoInfer<Partial<Record<F, SortDirection | "none">>>;
};

// Label for a sort field, so a screen's collapsed trigger row always reads the
// same as the sheet.
export function useSortFieldLabel<F extends string>(
  labels?: SortLabels<F>,
): (field: F) => string {
  const { t } = useTranslation();
  return useCallback(
    (field: F) => labels?.[field] ?? t(`app.shared.sort.${field}`),
    [labels, t],
  );
}

export default function SortOptionsSheet<F extends string>({
  ref,
  fields,
  sort,
  onSelect,
  labels,
  lockedDirections,
}: SortOptionsSheetProps<F>) {
  const [emerald500] = Uniwind.getCSSVariable(["--color-emerald-500"]) as [
    string,
  ];
  const label = useSortFieldLabel(labels);
  const { field: activeField, direction } = parseSortType(sort);
  const modalRef = useRef<BottomSheetModal | null>(null);
  const setRefs = useCallback(
    (instance: BottomSheetModal | null) => {
      modalRef.current = instance;
      if (typeof ref === "function") {
        ref(instance);
      } else if (ref) {
        ref.current = instance;
      }
    },
    [ref],
  );

  const handlePress = (field: F) => {
    modalRef.current?.dismiss();
    const lock = lockedDirections?.[field];
    onSelect(
      lock && lock !== "none"
        ? buildSortType(field, lock)
        : lock === "none"
          ? buildSortType(field, "asc")
          : toggleSortType(sort, field),
    );
  };

  return (
    <CenteredBottomSheetModal
      ref={setRefs}
      backgroundStyle={{
        backgroundColor: "rgb(41, 41, 41)",
      }}
      handleIndicatorStyle={{
        backgroundColor: "#b3b3b3",
      }}
    >
      <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
        <Box className="p-6 w-full mb-12">
          <VStack className="mt-6 gap-y-8">
            {fields.map((field) => (
              <FadeOutScaleDown
                key={field}
                testID={`sort-option-${field}`}
                onPress={() => handlePress(field)}
              >
                <HStack className="items-center justify-between">
                  <Text className="text-lg text-gray-200 ml-4">
                    {label(field)}
                  </Text>
                  {activeField === field &&
                    lockedDirections?.[field] !== "none" &&
                    (direction === "asc" ? (
                      <ArrowUp size={24} color={emerald500} />
                    ) : (
                      <ArrowDown size={24} color={emerald500} />
                    ))}
                </HStack>
              </FadeOutScaleDown>
            ))}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
