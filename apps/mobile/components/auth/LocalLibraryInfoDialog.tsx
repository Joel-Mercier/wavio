import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

const PICARD_URL = "https://picard.musicbrainz.org/";

export default function LocalLibraryInfoDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} size="md">
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t("auth.login.localInfoTitle")}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          <VStack className="gap-y-4">
            <VStack className="gap-y-1">
              <Heading className="text-white font-bold" size="sm">
                {t("auth.login.localInfoFormatsTitle")}
              </Heading>
              <Text className="text-primary-50" size="sm">
                {t("auth.login.localInfoFormats")}
              </Text>
            </VStack>
            <VStack className="gap-y-1">
              <Heading className="text-white font-bold" size="sm">
                {t("auth.login.localInfoMetadataTitle")}
              </Heading>
              <Text className="text-primary-50" size="sm">
                {t("auth.login.localInfoMetadata")}
              </Text>
            </VStack>
            <VStack className="gap-y-1">
              <Heading className="text-white font-bold" size="sm">
                {t("auth.login.localInfoTaggingTitle")}
              </Heading>
              <Text className="text-primary-50" size="sm">
                {t("auth.login.localInfoTagging")}
              </Text>
              <FadeOutScaleDown
                onPress={() => Linking.openURL(PICARD_URL)}
                className="mt-1 self-start"
              >
                <Text className="text-emerald-500 font-bold" size="sm">
                  {t("auth.login.localInfoTaggingLink")}
                </Text>
              </FadeOutScaleDown>
            </VStack>
          </VStack>
        </AlertDialogBody>
        <AlertDialogFooter className="items-center justify-center">
          <FadeOutScaleDown
            onPress={onClose}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            <Text className="text-primary-800 font-bold text-lg">
              {t("auth.login.localInfoClose")}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
