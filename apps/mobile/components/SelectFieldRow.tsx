import ChevronDownIcon from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

// A labelled, tappable field that shows the current selection and opens a
// select sheet on press.
export default function SelectFieldRow({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string | undefined;
  placeholder: string;
  onPress: () => void;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  return (
    <FadeOutScaleDown onPress={onPress} className="my-2">
      <VStack className="gap-y-2">
        <Text className="text-white">{label}</Text>
        <HStack className="bg-primary-600 rounded-md px-6 py-3 items-center justify-between">
          <Text className="text-md text-white flex-1 pr-3" numberOfLines={1}>
            {value || placeholder}
          </Text>
          <ChevronDownIcon size={18} color={white} />
        </HStack>
      </VStack>
    </FadeOutScaleDown>
  );
}
