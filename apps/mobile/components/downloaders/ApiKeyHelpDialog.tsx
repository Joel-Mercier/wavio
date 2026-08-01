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

// Every downloader needs the same "where do I find my API key?" walkthrough, so
// the copy is looked up under the downloader's own i18n prefix:
// `<i18nPrefix>.apiKeyHelp{Title,Step1..N,Close}`.
export default function ApiKeyHelpDialog({
  isOpen,
  onClose,
  i18nPrefix,
  stepCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  i18nPrefix: string;
  stepCount: number;
}) {
  const { t } = useTranslation();
  const steps = Array.from({ length: stepCount }, (_, i) => i + 1);
  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} size="md">
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t(`${i18nPrefix}.apiKeyHelpTitle`)}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          <VStack className="gap-y-4">
            {steps.map((step) => (
              <HStack key={step} className="gap-x-3">
                <Box className="w-6 h-6 rounded-full bg-emerald-500 items-center justify-center">
                  <Text className="text-primary-800 font-bold" size="sm">
                    {step}
                  </Text>
                </Box>
                <Text className="text-primary-50 flex-1" size="sm">
                  {t(`${i18nPrefix}.apiKeyHelpStep${step}`)}
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
              {t(`${i18nPrefix}.apiKeyHelpClose`)}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
