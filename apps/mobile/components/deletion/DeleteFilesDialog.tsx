import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { Heading } from "@/components/ui/heading";
import { Progress, ProgressFilledTrack } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import {
  filesAreOnDeviceType,
  isIndexBackedType,
} from "@/services/backend/serverTraits";
import {
  type DeletionFailureReason,
  type DeletionProgress,
  type DeletionResult,
  deleteTracks,
  tracksOfAlbum,
  tracksOfArtist,
} from "@/services/fileDeletion";
import { useAuthBase } from "@/stores/auth";

export type DeletionTarget =
  | {
      kind: "tracks";
      tracks: { id: string; title?: string; albumId?: string }[];
    }
  | { kind: "album"; id: string; name: string }
  | { kind: "artist"; id: string; name: string };

// Long enough that a tap meant for something else can't land on the button
// that just appeared under the finger.
const CONFIRM_DELAY_SECONDS = 3;

const REASON_KEYS: Record<DeletionFailureReason, string> = {
  notAllowed: "app.fileDeletion.reasons.notAllowed",
  inUse: "app.fileDeletion.reasons.inUse",
  unreachable: "app.fileDeletion.reasons.unreachable",
  serverError: "app.fileDeletion.reasons.serverError",
  other: "app.fileDeletion.reasons.other",
};

function useTargetTracks(target: DeletionTarget | null, isOpen: boolean) {
  const collection = target && target.kind !== "tracks" ? target : null;
  const query = useQuery({
    queryKey: ["deletionTracks", collection?.kind, collection?.id],
    queryFn: () =>
      collection?.kind === "artist"
        ? tracksOfArtist(collection.id)
        : tracksOfAlbum(collection?.id ?? ""),
    enabled: isOpen && !!collection,
    staleTime: 0,
    gcTime: 0,
  });
  if (target?.kind === "tracks") {
    return { tracks: target.tracks, isLoading: false, isError: false };
  }
  return {
    tracks: query.data ?? [],
    isLoading: query.isPending,
    isError: query.isError,
  };
}

/**
 * Confirms a permanent delete, then shows its progress. Counts what will go
 * before asking, holds the confirm button back for a few seconds, and can't be
 * dismissed while files are being deleted. Ends with a toast saying what
 * happened, including a partial result.
 */
export default function DeleteFilesDialog({
  isOpen,
  onClose,
  target,
  onDeleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  target: DeletionTarget | null;
  onDeleted?: (result: DeletionResult) => void;
}) {
  const { t } = useTranslation();
  const { showSuccessToast, showInfoToast, showErrorToast } =
    useSettingsToast();
  const serverType = useAuthBase((state) => state.serverType);
  const { tracks, isLoading, isError } = useTargetTracks(target, isOpen);
  const [secondsLeft, setSecondsLeft] = useState(CONFIRM_DELAY_SECONDS);
  const [progress, setProgress] = useState<DeletionProgress | null>(null);
  const cancelRequested = useRef(false);
  const [stopping, setStopping] = useState(false);
  const deleting = progress != null;

  useEffect(() => {
    if (!isOpen) return;
    setSecondsLeft(CONFIRM_DELAY_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) clearInterval(interval);
        return Math.max(0, value - 1);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const where = t(
    filesAreOnDeviceType(serverType)
      ? "app.fileDeletion.where.device"
      : isIndexBackedType(serverType)
        ? "app.fileDeletion.where.share"
        : "app.fileDeletion.where.server",
  );

  const description = !target
    ? ""
    : target.kind === "album"
      ? t("app.fileDeletion.albumDescription", { name: target.name, where })
      : target.kind === "artist"
        ? t("app.fileDeletion.artistDescription", { name: target.name, where })
        : target.tracks.length === 1
          ? t("app.fileDeletion.trackDescription", {
              title: target.tracks[0].title ?? "",
              where,
            })
          : t("app.fileDeletion.tracksDescription", { where });

  const albumCount = new Set(
    tracks.map((track) => ("albumId" in track ? track.albumId : undefined)),
  ).size;
  const summary =
    target?.kind === "artist"
      ? `${t("app.fileDeletion.songCount", { count: tracks.length })} · ${t(
          "app.fileDeletion.albumCount",
          { count: albumCount },
        )}`
      : t("app.fileDeletion.songCount", { count: tracks.length });

  const reportResult = (result: DeletionResult, total: number) => {
    const deleted = result.deleted.length;
    const reason = result.failed[0]?.reason;
    if (result.failed.length === 0 && !result.cancelled) {
      showSuccessToast(
        t("app.fileDeletion.deletedMessage", { count: deleted }),
      );
    } else if (result.failed.length === 0) {
      showInfoToast(t("app.fileDeletion.stoppedMessage", { count: deleted }));
    } else if (deleted > 0) {
      showErrorToast(
        `${t("app.fileDeletion.partialMessage", { deleted, total })} ${t(
          REASON_KEYS[reason ?? "other"],
        )}`,
      );
    } else {
      showErrorToast(
        `${t("app.fileDeletion.failedMessage")} ${t(REASON_KEYS[reason ?? "other"])}`,
      );
    }
  };

  const handleConfirm = async () => {
    if (!target || tracks.length === 0 || deleting) return;
    cancelRequested.current = false;
    setStopping(false);
    const total = tracks.length;
    setProgress({ done: 0, total });
    let result: DeletionResult;
    try {
      result = await deleteTracks(
        tracks.map((track) => ({ id: track.id, albumId: track.albumId })),
        {
          collectionId: target.kind === "tracks" ? undefined : target.id,
          onProgress: setProgress,
          isCancelled: () => cancelRequested.current,
        },
      );
    } catch {
      result = {
        deleted: [],
        failed: [{ id: "", reason: "other" }],
        cancelled: false,
      };
    }
    setProgress(null);
    onClose();
    reportResult(result, total);
    onDeleted?.(result);
  };

  const confirmDisabled =
    isLoading || isError || tracks.length === 0 || secondsLeft > 0;

  return (
    <AlertDialog
      isOpen={isOpen}
      onClose={deleting ? () => {} : onClose}
      size="md"
    >
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t(
              target?.kind === "tracks" && target.tracks.length === 1
                ? "app.fileDeletion.titleOne"
                : "app.fileDeletion.titleMany",
            )}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          {deleting ? (
            <>
              <Text className="text-primary-50 mb-3" size="sm">
                {t("app.fileDeletion.progress", {
                  done: progress.done,
                  total: progress.total,
                })}
              </Text>
              <Progress
                value={
                  progress.total > 0
                    ? (progress.done / progress.total) * 100
                    : 0
                }
                className="bg-primary-600"
              >
                <ProgressFilledTrack className="bg-red-500" />
              </Progress>
            </>
          ) : (
            <>
              <Text className="text-primary-50" size="sm">
                {description}
              </Text>
              {isLoading ? (
                <Spinner className="mt-3 self-start" />
              ) : isError ? (
                <Text className="text-red-500 mt-3" size="sm">
                  {t("app.fileDeletion.loadFailed")}
                </Text>
              ) : tracks.length === 0 ? (
                <Text className="text-primary-100 mt-3" size="sm">
                  {t("app.fileDeletion.nothingToDelete")}
                </Text>
              ) : target?.kind !== "tracks" || tracks.length > 1 ? (
                <Text className="text-white font-bold mt-3" size="sm">
                  {summary}
                </Text>
              ) : null}
              <Text className="text-red-500 font-bold mt-3" size="sm">
                {t("app.fileDeletion.cannotBeUndone")}
              </Text>
            </>
          )}
        </AlertDialogBody>
        <AlertDialogFooter className="items-center justify-center">
          {deleting ? (
            <FadeOutScaleDown
              testID="delete-files-stop"
              disabled={stopping}
              onPress={() => {
                cancelRequested.current = true;
                setStopping(true);
              }}
              className="items-center justify-center py-3 px-8 border border-white rounded-full"
            >
              <Text className="text-white font-bold text-lg">
                {t(
                  stopping
                    ? "app.fileDeletion.stopping"
                    : "app.fileDeletion.stop",
                )}
              </Text>
            </FadeOutScaleDown>
          ) : (
            <>
              <FadeOutScaleDown
                testID="delete-files-cancel"
                onPress={onClose}
                className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
              >
                <Text className="text-white font-bold text-lg">
                  {t("app.shared.cancel")}
                </Text>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                testID="delete-files-confirm"
                onPress={() => void handleConfirm()}
                disabled={confirmDisabled}
                className="items-center justify-center py-3 px-8 border rounded-full border-red-500 bg-red-500 ml-4"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {secondsLeft > 0
                    ? t("app.fileDeletion.confirmIn", { seconds: secondsLeft })
                    : t("app.shared.delete")}
                </Text>
              </FadeOutScaleDown>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
