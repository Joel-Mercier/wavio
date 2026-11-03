import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleDashed from "lucide-react-native/icons/circle-dashed";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { usePodcastPlayedCount } from "@/hooks/usePodcastPlayed";
import {
  markPodcastEpisodesPlayed,
  markPodcastEpisodesUnplayed,
} from "@/services/podcastProgress";
import type { PodcastSource } from "@/stores/podcasts";
import { TOAST_DURATION } from "@/utils/toastDuration";

interface MarkAllPlayedMenuItemsProps {
  ids: string[];
  source: PodcastSource;
  // Dismisses the sheet the items sit in.
  onDone: () => void;
}

// Each item only shows when it would change something, so a partly played
// channel offers both.
export default function MarkAllPlayedMenuItems({
  ids,
  source,
  onDone,
}: MarkAllPlayedMenuItemsProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const toast = useToast();
  const playedCount = usePodcastPlayedCount(ids, source);

  const handlePress = (played: boolean) => {
    onDone();
    if (played) {
      markPodcastEpisodesPlayed(ids, source);
    } else {
      markPodcastEpisodesUnplayed(ids, source);
    }
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.default,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {played
              ? t("app.podcasts.markAllAsPlayedSuccessMessage")
              : t("app.podcasts.markAllAsUnplayedSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  return (
    <>
      {playedCount < ids.length && (
        <FadeOutScaleDown onPress={() => handlePress(true)}>
          <HStack className="items-center">
            <CircleCheck size={24} color={white} />
            <Text className="ml-4 text-lg text-gray-200">
              {t("app.podcasts.markAllAsPlayed")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
      )}
      {playedCount > 0 && (
        <FadeOutScaleDown onPress={() => handlePress(false)}>
          <HStack className="items-center">
            <CircleDashed size={24} color={white} />
            <Text className="ml-4 text-lg text-gray-200">
              {t("app.podcasts.markAllAsUnplayed")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
      )}
    </>
  );
}
