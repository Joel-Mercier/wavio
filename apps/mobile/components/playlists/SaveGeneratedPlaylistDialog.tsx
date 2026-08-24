import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
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
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { createAudioMusePlaylist } from "@/services/audioMuse/playlists";
import { createPlaylist } from "@/services/backend/playlists";
import useAudioMuse from "@/stores/audioMuse";

// Two writers produce the same playlist by different routes: the app creates it
// as the signed-in user through the active backend, or AudioMuse creates it on
// the media server with the credentials it was configured with. For an AudioMuse
// generator, which one runs is the stored `saveTarget` preference and nothing
// else — this dialog reports it rather than offering the same choice a second
// time. A caller that is not an AudioMuse generator passes `target` explicitly
// and that preference does not apply to it at all.
//
// AudioMuse hardcodes an "_instant" suffix on everything it creates (see
// create_instant_playlist in its Navidrome and Jellyfin backends) with no
// request field to turn it off, so the name entered here is not the name that
// lands on the server. Saying so up front beats discovering it afterwards.
const AUDIOMUSE_NAME_SUFFIX = "_instant";

export type SavePlaylistTarget = "backend" | "audiomuse";

// The i18n keys stay under app.audiomuse.save.* even though this component now
// serves other callers: the strings are generic ("Save as playlist", "Playlist
// name") and already translated into every locale, so renaming them would churn
// Crowdin for no user-visible gain.
export default function SaveGeneratedPlaylistDialog({
  isOpen,
  onClose,
  trackIds,
  defaultName = "",
  target: targetProp,
}: {
  isOpen: boolean;
  onClose: () => void;
  trackIds: string[];
  defaultName?: string;
  /** Forces the writer, for callers the AudioMuse preference doesn't govern. */
  target?: SavePlaylistTarget;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];

  const storedTarget = useAudioMuse((store) => store.saveTarget);
  const target = targetProp ?? storedTarget;
  const showTargetChoice = targetProp === undefined;
  const [name, setName] = useState(defaultName);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setName(defaultName);
  }, [isOpen, defaultName]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || trackIds.length === 0) return;
    setIsSaving(true);
    try {
      if (target === "audiomuse") {
        await createAudioMusePlaylist(trimmed, trackIds);
      } else {
        await createPlaylist(trimmed, trackIds);
      }
      // Either writer lands the playlist on the server, so the app's list is
      // stale whichever one ran.
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      showSuccessToast(t("app.audiomuse.save.success"));
      onClose();
    } catch {
      showErrorToast(t("app.audiomuse.save.failed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} size="md">
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t("app.audiomuse.save.title")}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          <VStack className="gap-y-4">
            <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
              <InputField
                value={name}
                onChangeText={setName}
                className="text-md text-white"
                placeholder={t("app.audiomuse.save.namePlaceholder")}
                placeholderTextColor={primary50}
                autoFocus
              />
            </Input>
            {target === "audiomuse" && !!name.trim() && (
              <Text className="text-primary-100 text-sm">
                {t("app.audiomuse.save.instantSuffixNote", {
                  name: `${name.trim()}${AUDIOMUSE_NAME_SUFFIX}`,
                })}
              </Text>
            )}
            {showTargetChoice && (
              <VStack className="gap-y-1">
                <HStack className="items-center justify-between gap-x-4">
                  <Text className="text-primary-100 text-sm">
                    {t("app.audiomuse.save.targetLabel")}
                  </Text>
                  <Text className="text-white text-sm font-bold">
                    {t(
                      `app.settings.integrations.audiomuse.saveTarget.${target}`,
                    )}
                  </Text>
                </HStack>
                <Text className="text-primary-100 text-xs">
                  {t("app.audiomuse.save.targetHint")}
                </Text>
              </VStack>
            )}
          </VStack>
        </AlertDialogBody>
        <AlertDialogFooter className="items-center justify-center gap-x-4">
          <FadeOutScaleDown
            onPress={onClose}
            className="items-center justify-center py-3 px-8 border border-primary-400 rounded-full"
          >
            <Text className="text-white font-bold text-lg">
              {t("app.shared.cancel")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            onPress={handleSave}
            disabled={isSaving || !name.trim()}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            {isSaving ? (
              <Spinner color="rgb(41, 41, 41)" />
            ) : (
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.audiomuse.save.action")}
              </Text>
            )}
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
