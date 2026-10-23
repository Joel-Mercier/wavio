import ShieldCheck from "lucide-react-native/icons/shield-check";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

/**
 * Stands in for the username and password fields while single sign-on is on,
 * so the form says plainly how this sign-in is going to happen.
 */
export default function SsoNotice({
  issuerHost,
  onUsePassword,
}: {
  issuerHost: string | null;
  onUsePassword: () => void;
}) {
  const { t } = useTranslation();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  return (
    <VStack className="my-2 rounded-md border border-emerald-500 bg-primary-600 px-6 py-4">
      <HStack className="items-center gap-3">
        <ShieldCheck size={22} color={emerald500} />
        <Text className="text-white font-bold text-md">
          {t("auth.login.ssoActiveTitle")}
        </Text>
      </HStack>
      <Text className="text-primary-100 text-sm mt-2">
        {issuerHost
          ? t("auth.login.ssoActiveDescription", { host: issuerHost })
          : t("auth.login.ssoActiveDescriptionGeneric")}
      </Text>
      <FadeOutScaleDown onPress={onUsePassword} className="mt-3 self-start">
        <Text className="text-emerald-500 text-sm font-bold">
          {t("auth.login.ssoUsePassword")}
        </Text>
      </FadeOutScaleDown>
    </VStack>
  );
}
