import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  chooseClientCertificate,
  isClientCertPickerAvailable,
  isSslTrustAvailable,
} from "@/modules/ssl-trust";

/**
 * mTLS client-certificate picker for the server forms. Launches the Android
 * KeyChain system chooser and stores only the selected alias (the private key
 * stays in the OS keystore). Android-only: renders nothing where the native
 * module is unavailable (iOS / web / pre-rebuild). See modules/ssl-trust.
 */
export default function ClientCertificateField({
  value,
  host,
  onChange,
}: {
  value: string | undefined;
  // Hostname hint shown in the OS chooser (from the current URL field).
  host: string;
  onChange: (alias: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  if (Platform.OS !== "android" || !isSslTrustAvailable()) return null;

  // The picker is a native function added after the base ssl-trust module; an
  // app binary built before it has the module but not the function, so the
  // chooser can't launch. Surface that instead of a button that does nothing.
  const pickerAvailable = isClientCertPickerAvailable();

  const handlePick = async () => {
    try {
      const alias = await chooseClientCertificate(host || null);
      if (alias) {
        onChange(alias);
        return;
      }
      // Android returns null both when the user cancels and when the credential
      // store has no client certificate to offer — in the latter case the
      // chooser closes immediately with no visible UI, so the button looks
      // dead. There's no API to tell the two apart, so nudge toward installing
      // a certificate.
      toast.show({
        placement: "top",
        duration: 4000,
        render: () => (
          <Toast action="info">
            <ToastTitle>{t("auth.clientCertificate.noneTitle")}</ToastTitle>
            <ToastDescription>
              {t("auth.clientCertificate.noneMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (error) {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>{(error as Error).message}</ToastDescription>
          </Toast>
        ),
      });
    }
  };

  return (
    <VStack className="my-2 gap-y-2">
      <Text className="text-primary-100 text-sm">
        {t("auth.clientCertificate.label")}
      </Text>
      {!pickerAvailable ? (
        <Text className="text-amber-400 text-sm">
          {t("auth.clientCertificate.unavailable")}
        </Text>
      ) : value ? (
        <HStack className="items-center justify-between rounded-md bg-primary-600 border border-primary-600 px-4 py-3 gap-x-3">
          <Text className="text-white text-md flex-1" numberOfLines={1}>
            {value}
          </Text>
          <HStack className="gap-x-4">
            <FadeOutScaleDown onPress={handlePick}>
              <Text className="text-emerald-500 font-bold text-sm">
                {t("auth.clientCertificate.change")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={() => onChange(undefined)}>
              <Text className="text-red-400 font-bold text-sm">
                {t("auth.clientCertificate.remove")}
              </Text>
            </FadeOutScaleDown>
          </HStack>
        </HStack>
      ) : (
        <FadeOutScaleDown
          onPress={handlePick}
          className="items-center rounded-md bg-primary-600 border border-primary-600 px-4 py-3"
        >
          <Text className="text-emerald-500 font-bold text-sm">
            {t("auth.clientCertificate.select")}
          </Text>
        </FadeOutScaleDown>
      )}
      <Text className="text-primary-100 text-xs">
        {t("auth.clientCertificate.hint")}
      </Text>
    </VStack>
  );
}
