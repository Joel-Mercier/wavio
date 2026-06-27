import {
  BottomSheetBackdrop,
  type BottomSheetModal,
  type BottomSheetModalProps,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import type { RefObject } from "react";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

export type SheetOption<T> = {
  value: T;
  label: string;
  description?: string;
};

/** Single-select option list inside a bottom sheet, used by the settings screen. */
export default function OptionsBottomSheetModal<
  T extends string | number | null,
>({
  modalRef,
  onChange,
  options,
  selectedValue,
  onSelect,
  header,
  headerDescription,
  dismissOnSelect = false,
}: {
  modalRef: RefObject<BottomSheetModal | null>;
  onChange: BottomSheetModalProps["onChange"];
  options: SheetOption<T>[];
  selectedValue: T | null;
  onSelect: (value: T) => void;
  header?: string;
  headerDescription?: string;
  dismissOnSelect?: boolean;
}) {
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  return (
    <CenteredBottomSheetModal
      ref={modalRef}
      onChange={onChange}
      backgroundStyle={{
        backgroundColor: "rgb(41, 41, 41)",
      }}
      handleIndicatorStyle={{
        backgroundColor: "#b3b3b3",
      }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
    >
      <BottomSheetView
        style={{
          flex: 1,
          alignItems: "center",
        }}
      >
        <Box className="p-6 w-full mb-12">
          {header && (
            <VStack className="gap-y-2">
              <Heading className="text-white font-bold" size="md">
                {header}
              </Heading>
              {headerDescription && (
                <Text className="text-primary-100 text-sm">
                  {headerDescription}
                </Text>
              )}
            </VStack>
          )}
          <VStack className="mt-6 gap-y-8">
            {options.map((option) => (
              <FadeOutScaleDown
                key={String(option.value)}
                onPress={() => {
                  onSelect(option.value);
                  if (dismissOnSelect) modalRef.current?.dismiss();
                }}
              >
                <HStack
                  className={
                    option.description
                      ? "items-center justify-between gap-x-4"
                      : "items-center justify-between"
                  }
                >
                  <VStack
                    className={
                      option.description ? "ml-4 flex-1 gap-y-1" : "ml-4"
                    }
                  >
                    <Text className="text-lg text-gray-200">
                      {option.label}
                    </Text>
                    {option.description && (
                      <Text className="text-primary-100 text-sm">
                        {option.description}
                      </Text>
                    )}
                  </VStack>
                  {selectedValue === option.value && (
                    <Check size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
            ))}
          </VStack>
        </Box>
      </BottomSheetView>
    </CenteredBottomSheetModal>
  );
}
