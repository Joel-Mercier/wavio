import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { type CertificateInfo, getCertificateInfo } from "@/modules/ssl-trust";
import { logError } from "@/utils/log";

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <VStack className="gap-y-0.5">
      <Heading className="text-white font-bold" size="xs">
        {label}
      </Heading>
      <Text className="text-primary-50 break-all" size="sm">
        {value}
      </Text>
    </VStack>
  );
}

// Trust-On-First-Use dialog shown when a server presents an untrusted
// (typically self-signed) TLS certificate. Inspects the cert and lets the user
// trust it, then calls `onTrusted` so the caller can retry the request.
export default function CertificateTrustDialog({
  isOpen,
  url,
  onClose,
  onTrusted,
}: {
  isOpen: boolean;
  url: string | null;
  onClose: () => void;
  onTrusted: (hostname: string, fingerprint: string) => void;
}) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<CertificateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen || !url) return;
    let cancelled = false;
    setInfo(null);
    setError(false);
    setLoading(true);
    getCertificateInfo(url)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch((err) => {
        logError(err);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, url]);

  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} size="lg">
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t("auth.certificateTrust.title")}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          <VStack className="gap-y-4">
            <Text className="text-primary-50" size="sm">
              {t("auth.certificateTrust.intro")}
            </Text>
            {loading && (
              <HStack className="items-center gap-x-3 py-2">
                <Spinner color="white" />
                <Text className="text-primary-100" size="sm">
                  {t("auth.certificateTrust.loading")}
                </Text>
              </HStack>
            )}
            {error && (
              <Text className="text-red-400" size="sm">
                {t("auth.certificateTrust.loadError")}
              </Text>
            )}
            {info && (
              <VStack className="gap-y-3">
                <HStack className="gap-x-2">
                  {info.selfSigned && (
                    <Badge
                      className="rounded-full bg-amber-100"
                      size="sm"
                      action="warning"
                    >
                      <BadgeText className="text-amber-700 normal-case">
                        {t("auth.certificateTrust.selfSigned")}
                      </BadgeText>
                    </Badge>
                  )}
                  {!info.systemTrusted && (
                    <Badge
                      className="rounded-full bg-red-100"
                      size="sm"
                      action="error"
                    >
                      <BadgeText className="text-red-700 normal-case">
                        {t("auth.certificateTrust.notSystemTrusted")}
                      </BadgeText>
                    </Badge>
                  )}
                </HStack>
                <Detail
                  label={t("auth.certificateTrust.hostname")}
                  value={info.hostname}
                />
                <Detail
                  label={t("auth.certificateTrust.subject")}
                  value={info.subject}
                />
                <Detail
                  label={t("auth.certificateTrust.issuer")}
                  value={info.issuer}
                />
                <Detail
                  label={t("auth.certificateTrust.fingerprint")}
                  value={info.sha256Fingerprint}
                />
                {!!info.validTo && (
                  <Detail
                    label={t("auth.certificateTrust.validity")}
                    value={t("auth.certificateTrust.validityRange", {
                      from: info.validFrom,
                      to: info.validTo,
                    })}
                  />
                )}
                <Text className="text-amber-400" size="xs">
                  {t("auth.certificateTrust.warning")}
                </Text>
              </VStack>
            )}
          </VStack>
        </AlertDialogBody>
        <AlertDialogFooter className="gap-x-3">
          <FadeOutScaleDown
            onPress={onClose}
            className="items-center justify-center py-2 px-6 border border-primary-400 rounded-full"
          >
            <Text className="text-white font-bold">
              {t("auth.certificateTrust.cancel")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            disabled={!info}
            onPress={() => {
              if (info) onTrusted(info.hostname, info.sha256Fingerprint);
            }}
            className={`items-center justify-center py-2 px-6 rounded-full border ${
              info
                ? "border-emerald-500 bg-emerald-500"
                : "border-primary-400 bg-primary-400"
            }`}
          >
            <Text className="text-primary-800 font-bold">
              {t("auth.certificateTrust.trust")}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
