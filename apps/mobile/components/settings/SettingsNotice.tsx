import Info from "lucide-react-native/dist/esm/icons/info.mjs";
import TriangleAlert from "lucide-react-native/dist/esm/icons/triangle-alert.mjs";
import { Uniwind } from "uniwind";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";

export type SettingsNoticeTone = "warning" | "info";

/**
 * The one callout used across settings for "this needs your attention but isn't
 * an error". Kept in a single component so every integration screen states its
 * caveats the same way rather than inventing its own box.
 */
export default function SettingsNotice({
  message,
  tone = "warning",
}: {
  message: string;
  tone?: SettingsNoticeTone;
}) {
  const [amber400, primary50] = Uniwind.getCSSVariable([
    "--color-amber-400",
    "--color-primary-50",
  ]) as string[];
  const Icon = tone === "warning" ? TriangleAlert : Info;

  return (
    <HStack className="items-start gap-x-3 rounded-md bg-primary-600 p-4">
      <Icon size={20} color={tone === "warning" ? amber400 : primary50} />
      <Text className="text-primary-50 text-sm flex-1">{message}</Text>
    </HStack>
  );
}
