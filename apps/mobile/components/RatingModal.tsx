import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import StarRating from "@/components/StarRating";
import { Heading } from "@/components/ui/heading";
import { Icon } from "@/components/ui/icon";
import {
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";

type RatingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  value: number;
  onConfirm: (rating: number) => void;
  isPending?: boolean;
  closeButtonTestID?: string;
};

export default function RatingModal({
  isOpen,
  onClose,
  title,
  value,
  onConfirm,
  isPending = false,
  closeButtonTestID,
}: RatingModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [pendingRating, setPendingRating] = useState(value || 0);

  useEffect(() => {
    if (isOpen) setPendingRating(value || 0);
  }, [isOpen, value]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} closeOnOverlayClick>
      <ModalBackdrop />
      <ModalContent
        className="bg-primary-800 border-primary-600 max-h-[80%]"
        style={{ marginBottom: insets.bottom, marginTop: insets.top }}
      >
        <ModalHeader>
          <Heading className="text-white">{title}</Heading>
          <ModalCloseButton testID={closeButtonTestID}>
            <Icon as={X} size="md" className="color-white" />
          </ModalCloseButton>
        </ModalHeader>
        <ModalBody className="mb-0 pb-8">
          <StarRating value={pendingRating} onChange={setPendingRating} />
        </ModalBody>
        <ModalFooter className="items-center justify-center">
          <FadeOutScaleDown
            onPress={onClose}
            className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
          >
            <Text className="text-white font-bold text-lg">
              {t("app.shared.cancel")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            disabled={isPending}
            onPress={() => {
              if (!isPending) onConfirm(pendingRating);
            }}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
          >
            {isPending ? (
              <Spinner color="rgb(41, 41, 41)" />
            ) : (
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.save")}
              </Text>
            )}
          </FadeOutScaleDown>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
