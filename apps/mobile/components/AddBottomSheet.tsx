import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import CloudDownload from "lucide-react-native/dist/esm/icons/cloud-download.mjs";
import Drama from "lucide-react-native/dist/esm/icons/drama.mjs";
import Fingerprint from "lucide-react-native/dist/esm/icons/fingerprint-pattern.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import Radio from "lucide-react-native/dist/esm/icons/radio.mjs";
import Sparkles from "lucide-react-native/dist/esm/icons/sparkles.mjs";
import Wand2 from "lucide-react-native/dist/esm/icons/wand-sparkles.mjs";
import Waypoints from "lucide-react-native/dist/esm/icons/waypoints.mjs";
import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useIsOnline } from "@/hooks/useIsOnline";
import useAudioMuse, {
  selectAiProvider,
  selectFingerprintAvailable,
  selectSimilarTracksAvailable,
  selectSongPathAvailable,
} from "@/stores/audioMuse";
import useAuth from "@/stores/auth";
import useLidarr from "@/stores/lidarr";
import { supportsSmartPlaylists } from "@/utils/navidromeVersion";

const AddBottomSheet = forwardRef<BottomSheetModal>((_props, ref) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  const hasNavidromeNative = useAuth((s) => s.hasNavidromeNative);
  const serverVersion = useAuth((s) => s.serverVersion);
  const capabilities = useCapabilities();
  const isOnline = useIsOnline();
  // Any configured downloader (only Lidarr today) surfaces the entry; it leads
  // to the downloaders list so the user picks which one to add from.
  const hasDownloader = useLidarr((s) => s.isConnected);
  // Prompt playlists need both a configured AudioMuse-AI and an LLM to run the
  // prompt through — either one the user picked or the deployment's default.
  const audioMuseAiProvider = useAudioMuse(selectAiProvider);
  const showAiPlaylist =
    useAudioMuse((s) => s.isConnected) && !!audioMuseAiProvider;
  // The fingerprint profiles the user's own play history, so it needs a media
  // server account on top of the AudioMuse connection — the entry stays hidden
  // until that is configured, since without it the call can only fail.
  const showFingerprint = useAudioMuse(selectFingerprintAvailable);
  // Both ends are picked in the screen itself, so unlike the fingerprint this
  // needs nothing but a connection and a library AudioMuse has analysed.
  const showSongPath = useAudioMuse(selectSongPathAvailable);
  // Seeding the same nearest-neighbour search with a mood cluster or an anchor
  // instead of a track, so it rides on exactly the analysis similar tracks does.
  const showMoodPlaylist = useAudioMuse(selectSimilarTracksAvailable);
  const showSmartPlaylist =
    capabilities.smartPlaylists &&
    hasNavidromeNative &&
    supportsSmartPlaylists(serverVersion);

  const dismiss = () => {
    if (ref && typeof ref !== "function") {
      ref.current?.dismiss();
    }
  };

  const handleCreatePlaylistPress = () => {
    dismiss();
    router.navigate("/playlists/new");
  };

  const handleCreateSmartPlaylistPress = () => {
    dismiss();
    router.navigate("/playlists/new-smart");
  };

  const handleCreateAiPlaylistPress = () => {
    dismiss();
    router.navigate("/playlists/new-ai");
  };

  const handleCreateFingerprintPlaylistPress = () => {
    dismiss();
    router.navigate("/playlists/new-fingerprint");
  };

  const handleCreateSongPathPress = () => {
    dismiss();
    router.navigate("/playlists/new-path");
  };

  const handleCreateMoodPlaylistPress = () => {
    dismiss();
    router.navigate("/playlists/new-mood");
  };

  const handleCreateInternetRadioStationPress = () => {
    dismiss();
    router.navigate("/internet-radio-stations/new");
  };

  const handleCreatePodcastChannelPress = () => {
    dismiss();
    router.navigate("/podcast-channels/new");
  };

  const handleAddMusicPress = () => {
    dismiss();
    router.navigate("/settings/downloaders");
  };

  return (
    <CenteredBottomSheetModal
      ref={ref}
      enablePanDownToClose={true}
      enableHalfExpand={false}
      backgroundStyle={{
        backgroundColor: "rgb(41, 41, 41)",
      }}
      handleIndicatorStyle={{
        backgroundColor: "#b3b3b3",
      }}
    >
      <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
        <Box className="p-6 w-full mb-12">
          <VStack className="mt-6 gap-y-8">
            <FadeOutScaleDown
              onPress={handleCreatePlaylistPress}
              disabled={!isOnline}
            >
              <HStack className="items-center">
                <ListMusic size={32} color={gray200} />
                <VStack className="ml-4 flex-1">
                  <Heading numberOfLines={1} className="text-white">
                    {t("app.create.playlistTitle")}
                  </Heading>
                  <Text className="text-md text-gray-200 flex-1">
                    {t("app.create.playlistDescription")}
                  </Text>
                </VStack>
              </HStack>
            </FadeOutScaleDown>
            {showSmartPlaylist && (
              <FadeOutScaleDown
                onPress={handleCreateSmartPlaylistPress}
                disabled={!isOnline}
              >
                <HStack className="items-center">
                  <Wand2 size={32} color={gray200} />
                  <VStack className="ml-4 flex-1">
                    <Heading numberOfLines={1} className="text-white">
                      {t("app.create.smartPlaylistTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200 flex-1">
                      {t("app.create.smartPlaylistDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            )}
            {showAiPlaylist && (
              <FadeOutScaleDown
                onPress={handleCreateAiPlaylistPress}
                disabled={!isOnline}
              >
                <HStack className="items-center">
                  <Sparkles size={32} color={gray200} />
                  <VStack className="ml-4 flex-1">
                    <Heading numberOfLines={1} className="text-white">
                      {t("app.create.aiPlaylistTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200 flex-1">
                      {t("app.create.aiPlaylistDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            )}
            {showFingerprint && (
              <FadeOutScaleDown
                onPress={handleCreateFingerprintPlaylistPress}
                disabled={!isOnline}
              >
                <HStack className="items-center">
                  <Fingerprint size={32} color={gray200} />
                  <VStack className="ml-4 flex-1">
                    <Heading numberOfLines={1} className="text-white">
                      {t("app.create.fingerprintTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200 flex-1">
                      {t("app.create.fingerprintDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            )}
            {showSongPath && (
              <FadeOutScaleDown
                onPress={handleCreateSongPathPress}
                disabled={!isOnline}
              >
                <HStack className="items-center">
                  <Waypoints size={32} color={gray200} />
                  <VStack className="ml-4 flex-1">
                    <Heading numberOfLines={1} className="text-white">
                      {t("app.create.songPathTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200 flex-1">
                      {t("app.create.songPathDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            )}
            {showMoodPlaylist && (
              <FadeOutScaleDown
                onPress={handleCreateMoodPlaylistPress}
                disabled={!isOnline}
              >
                <HStack className="items-center">
                  <Drama size={32} color={gray200} />
                  <VStack className="ml-4 flex-1">
                    <Heading numberOfLines={1} className="text-white">
                      {t("app.create.moodPlaylistTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200 flex-1">
                      {t("app.create.moodPlaylistDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            )}
            {capabilities.internetRadio && (
              <FadeOutScaleDown
                onPress={handleCreateInternetRadioStationPress}
                disabled={!isOnline}
              >
                <HStack className="items-center">
                  <Radio size={32} color={gray200} />
                  <VStack className="ml-4 flex-1">
                    <Heading numberOfLines={1} className="text-white">
                      {t("app.create.internetRadioStationTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200 flex-1">
                      {t("app.create.internetRadioStationDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            )}
            {capabilities.podcasts && (
              <FadeOutScaleDown
                onPress={handleCreatePodcastChannelPress}
                disabled={!isOnline}
              >
                <HStack className="items-center">
                  <Podcast size={32} color={gray200} />
                  <VStack className="ml-4 flex-1">
                    <Heading numberOfLines={1} className="text-white">
                      {t("app.create.podcastChannelTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200 flex-1">
                      {t("app.create.podcastChannelDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            )}
            {hasDownloader && (
              <FadeOutScaleDown
                onPress={handleAddMusicPress}
                disabled={!isOnline}
              >
                <HStack className="items-center">
                  <CloudDownload size={32} color={gray200} />
                  <VStack className="ml-4 flex-1">
                    <Heading numberOfLines={1} className="text-white">
                      {t("app.create.downloaderTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200 flex-1">
                      {t("app.create.downloaderDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            )}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
});

AddBottomSheet.displayName = "AddBottomSheet";

export default AddBottomSheet;
