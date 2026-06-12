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
import { cn } from "@/utils/tailwind";

export default function ConfirmActionDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmVariant = "primary",
  cancelLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  confirmVariant?: "primary" | "danger";
  /** Omit to render a single-action dialog without a cancel button. */
  cancelLabel?: string;
}) {
  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} size="md">
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {title}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          <Text className="text-primary-50" size="sm">
            {description}
          </Text>
        </AlertDialogBody>
        <AlertDialogFooter className="items-center justify-center">
          {cancelLabel != null && (
            <FadeOutScaleDown
              onPress={onClose}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {cancelLabel}
              </Text>
            </FadeOutScaleDown>
          )}
          <FadeOutScaleDown
            onPress={onConfirm}
            className={cn(
              "items-center justify-center py-3 px-8 border rounded-full",
              confirmVariant === "danger"
                ? "border-red-500 bg-red-500"
                : "border-emerald-500 bg-emerald-500",
              cancelLabel != null && "ml-4",
            )}
          >
            <Text className="text-primary-800 font-bold text-lg">
              {confirmLabel}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
