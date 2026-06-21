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
import { Text } from "@/components/ui/text";
import { reattach, takeOverLocally } from "@/services/jukebox";
import useJukebox from "@/stores/jukebox";
import { logError } from "@/utils/log";

// Shown on app launch when a jukebox session was still playing on the server.
// Spotify-Connect style: resume controlling the server, or take playback over
// on this device.
export default function JukeboxResumeDialog() {
  const { t } = useTranslation();
  const pendingResume = useJukebox((s) => s.pendingResume);
  const setPendingResume = useJukebox((s) => s.setPendingResume);

  const handleResume = () => {
    setPendingResume(false);
    reattach().catch(logError);
  };

  const handlePlayHere = () => {
    setPendingResume(false);
    takeOverLocally().catch(logError);
  };

  return (
    <AlertDialog
      isOpen={pendingResume}
      onClose={() => setPendingResume(false)}
      size="md"
    >
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t("app.player.jukeboxResumeTitle")}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          <Text className="text-primary-50" size="sm">
            {t("app.player.jukeboxResumeMessage")}
          </Text>
        </AlertDialogBody>
        <AlertDialogFooter className="flex-col w-full gap-y-3">
          <FadeOutScaleDown
            onPress={handleResume}
            className="w-full items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            <Text className="text-primary-800 font-bold text-lg">
              {t("app.player.jukeboxResumeResume")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            onPress={handlePlayHere}
            className="w-full items-center justify-center py-3 px-8 border border-white rounded-full"
          >
            <Text className="text-white font-bold text-lg">
              {t("app.player.jukeboxResumePlayHere")}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
