import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Badge, BadgeText } from "@/components/ui/badge";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

export default function ButtonSlotPicker<T extends string>({
  label,
  options,
  selected,
  optionLabel,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  selected: T | null;
  optionLabel: (option: T | null) => string;
  onSelect: (option: T | null) => void;
}) {
  return (
    <VStack className="gap-y-3">
      <Text className="text-lg text-gray-200">{label}</Text>
      <HStack className="flex-wrap gap-2">
        {[null, ...options].map((option) => (
          <FadeOutScaleDown
            key={option ?? "none"}
            onPress={() => onSelect(option)}
          >
            <Badge
              className={cn("rounded-full bg-primary-500 px-4 py-1", {
                "bg-emerald-500": option === selected,
              })}
            >
              <BadgeText className="normal-case text-md text-white">
                {optionLabel(option)}
              </BadgeText>
            </Badge>
          </FadeOutScaleDown>
        ))}
      </HStack>
    </VStack>
  );
}
