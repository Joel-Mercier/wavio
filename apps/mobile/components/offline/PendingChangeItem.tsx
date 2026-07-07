import { format } from "date-fns";
import CircleMinus from "lucide-react-native/dist/esm/icons/circle-minus.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import HeartCrack from "lucide-react-native/dist/esm/icons/heart-crack.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import ListX from "lucide-react-native/dist/esm/icons/list-x.mjs";
import Pencil from "lucide-react-native/dist/esm/icons/pencil.mjs";
import Star from "lucide-react-native/dist/esm/icons/star.mjs";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { OfflineAction, QueuedMutation } from "@/stores/offlineMutations";

interface PendingChangeItemProps {
  item: QueuedMutation;
  onRemovePress: () => void;
}

const actionIcon = (action: OfflineAction) => {
  switch (action.type) {
    case "star":
      return action.starred ? Heart : HeartCrack;
    case "setRating":
      return Star;
    case "playlistAddSongs":
      return ListPlus;
    case "playlistRemoveSongs":
      return ListX;
    case "playlistEdit":
      return Pencil;
    case "playlistDelete":
      return Trash2;
  }
};

export default function PendingChangeItem({
  item,
  onRemovePress,
}: PendingChangeItemProps) {
  const { t } = useTranslation();
  const [white, gray400] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-400",
  ]) as string[];
  const { action } = item;

  const description = (() => {
    switch (action.type) {
      case "star":
        return t(
          action.starred
            ? "app.pendingChanges.actions.star"
            : "app.pendingChanges.actions.unstar",
        );
      case "setRating":
        return t("app.pendingChanges.actions.setRating", {
          rating: action.rating,
        });
      case "playlistAddSongs":
        return t("app.pendingChanges.actions.playlistAddSongs", {
          count: action.songIds.length,
        });
      case "playlistRemoveSongs":
        return t("app.pendingChanges.actions.playlistRemoveSongs", {
          count: action.songIds.length,
        });
      case "playlistEdit":
        return t("app.pendingChanges.actions.playlistEdit");
      case "playlistDelete":
        return t("app.pendingChanges.actions.playlistDelete");
    }
  })();

  const Icon = actionIcon(action);

  return (
    <HStack className="items-center justify-between mb-4">
      <HStack className="items-center flex-1 mr-2">
        <FadeOutScaleDown className="mr-4" onPress={onRemovePress}>
          <CircleMinus size={24} color={gray400} />
        </FadeOutScaleDown>
        <Box className="w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center">
          <Icon size={24} color={white} />
        </Box>
        <VStack className="ml-4 flex-1">
          <Heading className="text-white text-md font-normal" numberOfLines={1}>
            {item.label ?? t("app.shared.unknown")}
          </Heading>
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {description}
          </Text>
          <Text className="text-primary-100 text-xs">
            {format(item.createdAt, "dd MMM yyyy HH:mm")}
          </Text>
        </VStack>
      </HStack>
    </HStack>
  );
}
