import Timer from "lucide-react-native/icons/timer";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { useSleepTimerLabel } from "@/components/player/SleepTimerBadge";
import { openSleepTimerSheet } from "@/components/player/SleepTimerSheet";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";

interface Props {
  onPress?: () => void;
}

export default function SleepTimerActionRow({ onPress }: Props) {
  const { t } = useTranslation();
  const [gray200, emerald500] = Uniwind.getCSSVariable([
    "--color-gray-200",
    "--color-emerald-500",
  ]) as string[];
  const label = useSleepTimerLabel();
  const color = label ? emerald500 : gray200;

  const handlePress = () => {
    onPress?.();
    openSleepTimerSheet();
  };

  return (
    <FadeOutScaleDown onPress={handlePress}>
      <HStack className="items-center">
        <Timer size={24} color={color} />
        <Text className="ml-4 text-lg" style={{ color }}>
          {label
            ? t("app.player.sleepTimerActive", { label })
            : t("app.player.sleepTimer")}
        </Text>
      </HStack>
    </FadeOutScaleDown>
  );
}
