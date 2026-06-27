import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2.mjs";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import {
  clearAllTrustedCertificates,
  getTrustedCertificates,
  removeTrustedCertificate,
  type TrustedCert,
} from "@/modules/ssl-trust";
import { syncSslProxy } from "@/services/sslTrust";
import useApp from "@/stores/app";
import { formatDistanceToNow } from "@/utils/date";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

export default function TrustedCertificatesDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
  const isLandscape = useApp((s) => s.isLandscape);

  const [certs, setCerts] = useState<TrustedCert[]>([]);
  const [removeTarget, setRemoveTarget] = useState<TrustedCert | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);

  const refresh = useCallback(async () => {
    setCerts(await getTrustedCertificates());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showSuccessToast = (description: string) => {
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>{description}</ToastDescription>
        </Toast>
      ),
    });
  };

  const handleRemove = async () => {
    const target = removeTarget;
    setRemoveTarget(null);
    if (!target) return;
    await removeTrustedCertificate(target.hostname);
    await syncSslProxy();
    await refresh();
    showSuccessToast(t("app.settings.securitySettings.removeSuccessMessage"));
  };

  const handleClearAll = async () => {
    setShowClearAll(false);
    await clearAllTrustedCertificates();
    await syncSslProxy();
    await refresh();
    showSuccessToast(t("app.settings.securitySettings.clearAllSuccessMessage"));
  };

  const isEmpty = certs.length === 0;

  return (
    <Box className="h-full">
      <Box className={cn("px-6 pb-6 flex-1", isLandscape ? "mb-6" : "mt-6")}>
        <HStack
          className="items-center justify-between mb-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white text-center flex-1" size="lg">
            {t("app.settings.securitySettings.trustedCertificatesTitle")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + floatingPlayerInset,
          }}
        >
          {isEmpty ? (
            <VStack className="gap-y-2 py-8">
              <Text className="text-white text-center" size="md">
                {t("app.settings.securitySettings.empty")}
              </Text>
              <Text className="text-primary-100 text-center" size="sm">
                {t("app.settings.securitySettings.emptyHint")}
              </Text>
            </VStack>
          ) : (
            <VStack className="gap-y-4">
              {certs.map((cert) => (
                <HStack
                  key={cert.hostname}
                  className="items-center justify-between gap-x-4 py-3"
                >
                  <VStack className="gap-y-1 flex-1">
                    <Heading className="text-white font-bold" size="sm">
                      {cert.hostname}
                    </Heading>
                    <Text className="text-primary-100 break-all" size="xs">
                      {t("app.settings.securitySettings.fingerprint", {
                        fingerprint: cert.sha256Fingerprint,
                      })}
                    </Text>
                    <Text className="text-primary-100" size="xs">
                      {t("app.settings.securitySettings.acceptedAt", {
                        date: formatDistanceToNow(new Date(cert.acceptedAt)),
                      })}
                    </Text>
                  </VStack>
                  <FadeOutScaleDown
                    onPress={() => setRemoveTarget(cert)}
                    className="items-center justify-center p-3 border border-red-500 rounded-full"
                  >
                    <Trash2 size={18} color="white" />
                  </FadeOutScaleDown>
                </HStack>
              ))}
              <FadeOutScaleDown
                onPress={() => setShowClearAll(true)}
                className="items-center justify-center py-3 px-8 mt-4 border border-red-500 bg-red-500 rounded-full self-center"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.settings.securitySettings.clearAll")}
                </Text>
              </FadeOutScaleDown>
            </VStack>
          )}
        </ScrollView>
      </Box>
      <ConfirmActionDialog
        isOpen={removeTarget != null}
        onClose={() => setRemoveTarget(null)}
        title={t("app.settings.securitySettings.removeConfirmTitle")}
        description={t(
          "app.settings.securitySettings.removeConfirmDescription",
          {
            hostname: removeTarget?.hostname ?? "",
          },
        )}
        cancelLabel={t("app.shared.cancel")}
        confirmLabel={t("app.settings.securitySettings.remove")}
        confirmVariant="danger"
        onConfirm={handleRemove}
      />
      <ConfirmActionDialog
        isOpen={showClearAll}
        onClose={() => setShowClearAll(false)}
        title={t("app.settings.securitySettings.clearAllConfirmTitle")}
        description={t(
          "app.settings.securitySettings.clearAllConfirmDescription",
        )}
        cancelLabel={t("app.shared.cancel")}
        confirmLabel={t("app.settings.securitySettings.clearAll")}
        confirmVariant="danger"
        onConfirm={handleClearAll}
      />
    </Box>
  );
}
