import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useBottomSheetScrollableCreator } from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import { type RefObject, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SheetSearchInput from "@/components/SheetSearchInput";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";

export interface SelectBottomSheetOption {
  label: string;
  value: string;
}

// Generic single/multi select bottom sheet. `multiple` keeps the sheet open and
// toggles values; otherwise it selects one and dismisses. `searchable` shows a
// filter input for long option lists. Content reserves the bottom safe-area
// inset so the last option clears the navigation bar.
export default function SelectBottomSheet({
  sheetRef,
  title,
  options,
  selectedValues,
  onSelect,
  multiple = false,
  searchable = false,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  title: string;
  options: SelectBottomSheetOption[];
  selectedValues: string[];
  onSelect: (value: string) => void;
  multiple?: boolean;
  searchable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  const renderScrollComponent = useBottomSheetScrollableCreator();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [query, options]);

  const selectedSet = new Set(selectedValues);

  return (
    <CenteredBottomSheetModal
      ref={sheetRef}
      snapPoints={["75%"]}
      enableDynamicSizing={false}
      stackBehavior="push"
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <Box className="px-6 pt-2 pb-3">
        <Heading className="text-white mb-3" size="lg">
          {title}
        </Heading>
        {searchable && <SheetSearchInput onChangeText={setQuery} />}
      </Box>
      <FlashList
        data={filtered}
        keyExtractor={(item) => item.value}
        renderScrollComponent={renderScrollComponent}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        renderItem={({ item }) => (
          <FadeOutScaleDown
            onPress={() => {
              onSelect(item.value);
              if (!multiple) sheetRef.current?.dismiss();
            }}
          >
            <HStack className="items-center justify-between px-6 py-3">
              <Text
                className="text-md text-white flex-1 pr-4"
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {selectedSet.has(item.value) && (
                <Check size={20} color={emerald500} />
              )}
            </HStack>
          </FadeOutScaleDown>
        )}
      />
    </CenteredBottomSheetModal>
  );
}
