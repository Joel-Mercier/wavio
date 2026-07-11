import ChevronDown from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import ChevronUp from "lucide-react-native/dist/esm/icons/chevron-up.mjs";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

/**
 * Collapsible "Advanced settings" disclosure, collapsed by default, so
 * power-user fields (e.g. the mTLS client certificate) don't clutter the server
 * forms for the common case. Renders its children only while expanded.
 */
export default function AdvancedSettingsSection({
  children,
  defaultOpen = false,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const [primary100] = Uniwind.getCSSVariable([
    "--color-primary-100",
  ]) as string[];
  // Swap icons rather than rotating: a `rotate` in a lucide (react-native-svg)
  // icon's style pivots around the top-left corner, not the center, flinging it
  // out of view when open.
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <VStack className="my-2">
      <FadeOutScaleDown onPress={() => setOpen((v) => !v)}>
        <HStack className="items-center justify-between py-2">
          <Text className="text-primary-100 text-sm font-bold">
            {t("app.shared.advancedSettings")}
          </Text>
          <Chevron size={20} color={primary100} />
        </HStack>
      </FadeOutScaleDown>
      {open ? children : null}
    </VStack>
  );
}
