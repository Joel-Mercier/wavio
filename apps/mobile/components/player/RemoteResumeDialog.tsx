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

type Props = {
  isOpen: boolean;
  title: string;
  message: string;
  resumeLabel: string;
  playHereLabel: string;
  onResume: () => void;
  onPlayHere: () => void;
  onClose: () => void;
};

// Shown on app launch when playback was still going somewhere else — a jukebox
// on the server, a UPnP renderer on the network. Spotify-Connect style: resume
// controlling it, or take playback over on this device.
export default function RemoteResumeDialog({
  isOpen,
  title,
  message,
  resumeLabel,
  playHereLabel,
  onResume,
  onPlayHere,
  onClose,
}: Props) {
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
            {message}
          </Text>
        </AlertDialogBody>
        <AlertDialogFooter className="flex-col w-full gap-y-3">
          <FadeOutScaleDown
            onPress={onResume}
            className="w-full items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            <Text className="text-primary-800 font-bold text-lg">
              {resumeLabel}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            onPress={onPlayHere}
            className="w-full items-center justify-center py-3 px-8 border border-white rounded-full"
          >
            <Text className="text-white font-bold text-lg">
              {playHereLabel}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
