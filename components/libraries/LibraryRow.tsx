import { Check, Library } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { cn } from "@/utils/tailwind";

interface LibraryRowProps {
  label: string;
  isSelected: boolean;
  isDefault?: boolean;
  onPress: () => void;
}

export default function LibraryRow({
  label,
  isSelected,
  isDefault,
  onPress,
}: LibraryRowProps) {
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  return (
    <FadeOutScaleDown className="mb-3" onPress={onPress}>
      <HStack
        className={cn(
          "bg-primary-600 p-4 rounded-md border border-primary-600 items-center justify-between",
          { "border-emerald-500": isSelected },
        )}
      >
        <HStack className="items-center flex-1">
          <Library size={20} color={white} />
          <Heading
            size="md"
            className="text-white ml-3 flex-1 truncate"
            numberOfLines={1}
          >
            {label}
          </Heading>
          {isDefault && (
            <Text className="text-primary-100 text-xs ml-2 px-2 py-0.5 bg-primary-800 rounded-full">
              {t("app.libraries.default")}
            </Text>
          )}
        </HStack>
        {isSelected && <Check size={20} color={emerald500} />}
      </HStack>
    </FadeOutScaleDown>
  );
}
