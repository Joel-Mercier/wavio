import {
  type BottomSheetModal,
  useBottomSheetScrollableCreator,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import { useMemo, useState } from "react";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SheetSearchInput from "@/components/SheetSearchInput";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";

export interface SelectOption {
  label: string;
  value: string;
}

type SearchableSelectSheetProps = {
  ref: React.RefObject<BottomSheetModal | null>;
  title: string;
  anyLabel: string;
  options: SelectOption[];
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
  emerald: string;
};

/** Single-select picker with a search box and an "any" header row. */
export default function SearchableSelectSheet({
  ref,
  title,
  anyLabel,
  options,
  selectedValue,
  onSelect,
  emerald,
}: SearchableSelectSheetProps) {
  const [query, setQuery] = useState("");
  const renderScrollComponent = useBottomSheetScrollableCreator();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, options]);

  return (
    <CenteredBottomSheetModal
      ref={ref}
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
        <SheetSearchInput onChangeText={setQuery} />
      </Box>
      <FlashList
        data={filtered}
        keyExtractor={(item) => item.value}
        renderScrollComponent={renderScrollComponent}
        ListHeaderComponent={
          <FadeOutScaleDown onPress={() => onSelect("")}>
            <HStack className="items-center justify-between px-6 py-3">
              <Text className="text-md text-white flex-1 pr-4">{anyLabel}</Text>
              {!selectedValue && <Check size={20} color={emerald} />}
            </HStack>
          </FadeOutScaleDown>
        }
        renderItem={({ item }) => (
          <FadeOutScaleDown onPress={() => onSelect(item.value)}>
            <HStack className="items-center justify-between px-6 py-3">
              <Text className="text-md text-white flex-1 pr-4">
                {item.label}
              </Text>
              {selectedValue === item.value && (
                <Check size={20} color={emerald} />
              )}
            </HStack>
          </FadeOutScaleDown>
        )}
      />
    </CenteredBottomSheetModal>
  );
}
