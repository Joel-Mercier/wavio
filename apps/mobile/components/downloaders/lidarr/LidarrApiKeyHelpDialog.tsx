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
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

const STEP_KEYS = [
  "apiKeyHelpStep1",
  "apiKeyHelpStep2",
  "apiKeyHelpStep3",
] as const;

export default function LidarrApiKeyHelpDialog({
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
            {t("app.settings.downloaders.lidarr.apiKeyHelpTitle")}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          <VStack className="gap-y-4">
            {STEP_KEYS.map((key, index) => (
              <HStack key={key} className="gap-x-3">
                <Box className="w-6 h-6 rounded-full bg-emerald-500 items-center justify-center">
                  <Text className="text-primary-800 font-bold" size="sm">
                    {index + 1}
                  </Text>
                </Box>
                <Text className="text-primary-50 flex-1" size="sm">
                  {t(`app.settings.downloaders.lidarr.${key}`)}
                </Text>
              </HStack>
            ))}
          </VStack>
        </AlertDialogBody>
        <AlertDialogFooter className="items-center justify-center">
          <FadeOutScaleDown
            onPress={onClose}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            <Text className="text-primary-800 font-bold text-lg">
              {t("app.settings.downloaders.lidarr.apiKeyHelpClose")}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
