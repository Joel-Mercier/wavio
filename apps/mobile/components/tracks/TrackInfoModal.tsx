import { secondsToMinutes } from "date-fns/secondsToMinutes";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import { Heading } from "@/components/ui/heading";
import { Icon } from "@/components/ui/icon";
import {
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
} from "@/components/ui/modal";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Child } from "@/services/openSubsonic/types";
import type { QueueTrack } from "@/stores/queue";
import { formatDistanceToNow } from "@/utils/date";
import { niceBytes } from "@/utils/fileSize";

export default function TrackInfoModal({
  isOpen,
  onClose,
  track,
}: {
  isOpen: boolean;
  onClose: () => void;
  track: Child | QueueTrack | null;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];

  return (
    <Modal isOpen={isOpen} onClose={onClose} closeOnOverlayClick>
      <ModalBackdrop />
      <ModalContent
        className="bg-primary-800 border-primary-600 max-h-[80%]"
        style={{ marginBottom: insets.bottom, marginTop: insets.top }}
      >
        <ModalHeader>
          <Heading className="text-white">
            {t("app.tracks.trackInfoModalTitle")}
          </Heading>
          <ModalCloseButton testID="track-info-close-button">
            <Icon as={X} size="md" className="color-white" />
          </ModalCloseButton>
        </ModalHeader>
        <ModalBody className="mb-0 pb-0" showsVerticalScrollIndicator={false}>
          {track && (
            <VStack className="gap-y-2">
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.title")}
                </Text>
                <Text className="text-white">{track.title}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.path")}
                </Text>
                <Text className="text-white">{track.path}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.artist")}
                </Text>
                <Text className="text-white">{track.artist}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.artists")}
                </Text>
                <Text className="text-white">
                  {track.artists
                    ?.map((artist: { name: string }) => artist.name)
                    .join(", ")}
                </Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.album")}
                </Text>
                <Text className="text-white">{track.album}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.discNumber")}
                </Text>
                <Text className="text-white">{track.discNumber}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.track")}
                </Text>
                <Text className="text-white">{track.track}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.year")}
                </Text>
                <Text className="text-white">{track.year}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.genres")}
                </Text>
                <Text className="text-white">
                  {track.genres
                    ?.map((genre: { name: string }) => genre.name)
                    ?.join(", ")}
                </Text>
              </VStack>
              {track.groupings ? (
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.grouping")}
                  </Text>
                  <Text className="text-white">{track.groupings}</Text>
                </VStack>
              ) : null}
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.duration")}
                </Text>
                <Text className="text-white">
                  {track.duration
                    ? `${secondsToMinutes(track?.duration)}:${track?.duration % 60}`
                    : t("app.tracks.infoModal.unknownDuration")}
                </Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.codec")}
                </Text>
                <Text className="text-white">{track.suffix}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.bitRate")}
                </Text>
                <Text className="text-white">{track.bitRate}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.channelCount")}
                </Text>
                <Text className="text-white">{track.channelCount}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.size")}
                </Text>
                <Text className="text-white">{niceBytes(track.size || 0)}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.favorite")}
                </Text>
                <Text className="text-white">
                  {track.starred ? (
                    <Check color={white} size={14} />
                  ) : (
                    <X color={white} size={14} />
                  )}
                </Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.playCount")}
                </Text>
                <Text className="text-white">{track.playCount}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.lastPlayed")}
                </Text>
                <Text className="text-white">
                  {track.played
                    ? t("app.tracks.infoModal.lastPlayedDistance", {
                        distance: formatDistanceToNow(new Date(track.played)),
                      })
                    : t("app.tracks.infoModal.neverPlayed")}
                </Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.modified")}
                </Text>
                <Text className="text-white">{track.genre}</Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.albumPeak")}
                </Text>
                <Text className="text-white">
                  {track.replayGain?.albumPeak}
                </Text>
              </VStack>
              <VStack className="border-b border-primary-600 py-2">
                <Text className="text-primary-100 text-sm">
                  {t("app.tracks.infoModal.trackPeak")}
                </Text>
                <Text className="text-white">
                  {track.replayGain?.trackPeak}
                </Text>
              </VStack>
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
