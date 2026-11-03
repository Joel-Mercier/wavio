import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { type RefObject, useState } from "react";
import { useTranslation } from "react-i18next";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import { SettingsToggleRow } from "@/components/settings/SettingsRows";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  isPlaylistIncluded,
  isSmartPlaylist,
} from "@/services/offline/autoDownloadPlan";
import {
  autoDownloadService,
  fetchOwnPlaylists,
} from "@/services/offline/autoDownloadService";
import useOffline from "@/stores/offline";

const fetchPlaylistChoices = async () => {
  const { playlists, smartIds } = await fetchOwnPlaylists();
  return playlists.map((playlist) => ({
    playlist,
    smart: isSmartPlaylist(playlist, smartIds),
  }));
};

/** Per-playlist switches for the playlists automatic download. */
export default function AutoDownloadPlaylistsSheet({
  modalRef,
}: {
  modalRef: RefObject<BottomSheetModal | null>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const overrides = useOffline((s) => s.autoDownloadOverrides);
  const { data, isPending, isError } = useQuery({
    queryKey: ["autoDownloadPlaylistChoices"],
    queryFn: fetchPlaylistChoices,
    enabled: open,
  });

  return (
    <CenteredBottomSheetModal
      ref={modalRef}
      enableHalfExpand={false}
      snapPoints={["75%"]}
      enableDynamicSizing={false}
      onChange={(index) => setOpen(index >= 0)}
      onDismiss={() => setOpen(false)}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <Box className="p-6 w-full mb-12">
          <VStack className="gap-y-2">
            <Heading className="text-white font-bold" size="md">
              {t(
                "app.settings.offlineSettings.autoDownloadPlaylistsSheetTitle",
              )}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {t(
                "app.settings.offlineSettings.autoDownloadPlaylistsSheetDescription",
              )}
            </Text>
          </VStack>
          <VStack className="mt-4">
            {isPending && open && <Spinner className="mt-6" />}
            {isError && (
              <Text className="text-orange-400 text-sm mt-6">
                {t("app.settings.offlineSettings.autoDownloadPlaylistsError")}
              </Text>
            )}
            {data?.length === 0 && (
              <Text className="text-primary-100 text-sm mt-6">
                {t("app.settings.offlineSettings.autoDownloadPlaylistsEmpty")}
              </Text>
            )}
            {data?.map(({ playlist, smart }) => (
              <SettingsToggleRow
                key={playlist.id}
                label={playlist.name}
                description={t(
                  smart
                    ? "app.settings.offlineSettings.autoDownloadSmartPlaylistSongs"
                    : "app.settings.offlineSettings.autoDownloadPlaylistSongs",
                  { count: playlist.songCount },
                )}
                value={isPlaylistIncluded(overrides, playlist, smart)}
                onToggle={(included) =>
                  autoDownloadService.setPlaylistIncluded(
                    playlist,
                    smart,
                    included,
                  )
                }
              />
            ))}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
