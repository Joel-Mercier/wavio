import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import Cast from "lucide-react-native/dist/esm/icons/cast.mjs";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import RefreshCw from "lucide-react-native/dist/esm/icons/refresh-cw.mjs";
import Smartphone from "lucide-react-native/dist/esm/icons/smartphone.mjs";
import Speaker from "lucide-react-native/dist/esm/icons/speaker.mjs";
import Tv from "lucide-react-native/dist/esm/icons/tv.mjs";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import CastContext from "react-native-google-cast";
import { Uniwind } from "uniwind";
import BottomSheetModalComponent from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import GestureSlider from "@/components/GestureSlider";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useCapabilities } from "@/hooks/useCapabilities";
import { isUpnpAvailable, type UpnpDevice } from "@/modules/upnp-cast";
import {
  activate as activateJukebox,
  jukeboxCommitGain,
  jukeboxReconcileFromServer,
  jukeboxRefreshStatus,
  jukeboxSetGain,
  takeOverLocally,
} from "@/services/jukebox";
import {
  getCurrentTime,
  isPlaying as isLocalPlaying,
  pause as pauseLocal,
  play as playLocal,
} from "@/services/player";
import {
  upnpConnect,
  upnpDisconnect,
  upnpSearch,
  upnpSetVolume,
} from "@/services/upnp";
import useJukebox from "@/stores/jukebox";
import useQueue from "@/stores/queue";
import useUpnp from "@/stores/upnp";
import { logError } from "@/utils/log";

// A device that answered discovery but never got as far as a re-scan can take a
// moment to appear, so the sheet scans again shortly after opening rather than
// leaving the list looking final when it isn't.
const RESCAN_DELAY_MS = 6000;

// The output sheet lives once at the app root (mounted in app/(app)/_layout), so
// any screen — the player chrome or the floating player — opens it through this
// module-level ref rather than prop-drilling one.
let mountedSheetRef: RefObject<BottomSheetModal | null> | null = null;

export function openOutputSheet() {
  mountedSheetRef?.current?.present();
}

export function closeOutputSheet() {
  mountedSheetRef?.current?.dismiss();
}

// App-wide playback output picker. Mounted once at the app root and opened from
// anywhere via openOutputSheet (player chrome, floating player).
//
// Every output the app can reach lives here — this device, the server's jukebox,
// UPnP/DLNA renderers on the network, Chromecast — because they are alternatives
// to each other, and a row of separate buttons that hide one another was already
// confusing with two.
export default function OutputSheet() {
  const { t } = useTranslation();
  const toast = useToast();
  const [emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
  const sheetRef = useRef<BottomSheetModal>(null);
  const capabilities = useCapabilities();
  const jukeboxActive = useJukebox((s) => s.active);
  const jukeboxGain = useJukebox((s) => s.gain);
  const jukeboxStatus = useJukebox((s) => s.status);
  const queueLength = useQueue((s) => s.queue.length);
  const upnpConnected = useUpnp((s) => s.connected);
  const upnpDeviceId = useUpnp((s) => s.deviceId);
  const upnpDevices = useUpnp((s) => s.devices);
  const upnpScanning = useUpnp((s) => s.scanning);
  const upnpVolume = useUpnp((s) => s.volume);

  // Casting of any kind needs a URL the receiver can fetch for itself, which the
  // on-device library has no way to produce.
  const canCast = capabilities.remoteStreamableUrl;
  const showUpnp = canCast && isUpnpAvailable();
  const playingLocally = !jukeboxActive && !upnpConnected;

  useEffect(() => {
    mountedSheetRef = sheetRef;
    return () => {
      mountedSheetRef = null;
    };
  }, []);

  const showError = useCallback(
    (message: string) => {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>{message}</ToastDescription>
          </Toast>
        ),
      });
    },
    [t, toast],
  );

  // Whatever is playing elsewhere has to stop before something else starts, or
  // the listener ends up with two of them.
  const releaseCurrentOutput = useCallback(async () => {
    if (jukeboxActive) await takeOverLocally();
    if (upnpConnected) await upnpDisconnect();
  }, [jukeboxActive, upnpConnected]);

  const selectLocal = async () => {
    if (playingLocally) return;
    try {
      await releaseCurrentOutput();
    } catch (e) {
      logError(e);
    }
    sheetRef.current?.dismiss();
  };

  const selectJukebox = async () => {
    if (jukeboxActive) return;
    try {
      await releaseCurrentOutput();
    } catch (e) {
      logError(e);
    }
    const position = getCurrentTime();
    const wasPlaying = isLocalPlaying();
    pauseLocal();
    try {
      await activateJukebox({ position, autoplay: wasPlaying });
    } catch (error) {
      logError(error);
      if (wasPlaying) playLocal();
      showError(t("app.player.jukeboxErrorMessage"));
    }
  };

  const selectUpnpDevice = async (device: UpnpDevice) => {
    if (upnpDeviceId === device.id) return;
    try {
      await releaseCurrentOutput();
    } catch (e) {
      logError(e);
    }
    const connected = await upnpConnect(device);
    if (!connected) {
      showError(
        t("app.player.outputConnectErrorMessage", { name: device.name }),
      );
      return;
    }
    sheetRef.current?.dismiss();
  };

  const openChromecastPicker = () => {
    // Chromecast keeps its own device picker, which is also where an active
    // session is ended — so this hands off to it rather than mirroring its list.
    CastContext.showCastDialog().catch(logError);
  };

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index < 0) return;
      // Ping the server for live jukebox state rather than relying on stale
      // cached status. When a session is active, also pull the playlist so
      // another device's changes are reflected.
      if (capabilities.jukebox) {
        jukeboxRefreshStatus().catch(() => {});
        if (useJukebox.getState().active) {
          jukeboxReconcileFromServer().catch(() => {});
        }
      }
      if (!showUpnp) return;
      upnpSearch();
      const timer = setTimeout(upnpSearch, RESCAN_DELAY_MS);
      return () => clearTimeout(timer);
    },
    [capabilities.jukebox, showUpnp],
  );

  const outputRow = (
    key: string,
    icon: React.ReactNode,
    label: string,
    selected: boolean,
    onPress: () => void,
    subtitle?: string,
  ) => (
    <FadeOutScaleDown key={key} onPress={onPress}>
      <HStack className="items-center justify-between">
        <HStack className="items-center flex-1 mr-4">
          {icon}
          <VStack className="ml-4 flex-1">
            <Text
              className="text-lg"
              numberOfLines={1}
              style={{ color: selected ? emerald500 : gray200 }}
            >
              {label}
            </Text>
            {subtitle && (
              <Text className="text-sm text-primary-100" numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </VStack>
        </HStack>
        {selected && <Check size={20} color={emerald500} />}
      </HStack>
    </FadeOutScaleDown>
  );

  return (
    <BottomSheetModalComponent
      ref={sheetRef}
      onChange={handleSheetChange}
      enableHalfExpand={false}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
        <Box className="p-6 w-full mb-12">
          <HStack className="items-center mb-6">
            <Heading
              className="text-white font-normal"
              size="lg"
              numberOfLines={1}
            >
              {t("app.player.output")}
            </Heading>
          </HStack>

          <VStack className="gap-y-6">
            {outputRow(
              "local",
              <Smartphone
                size={20}
                color={playingLocally ? emerald500 : gray200}
              />,
              t("app.player.jukeboxDeviceThis"),
              playingLocally,
              selectLocal,
            )}

            {capabilities.jukebox &&
              outputRow(
                "jukebox",
                <Speaker
                  size={20}
                  color={jukeboxActive ? emerald500 : gray200}
                />,
                t("app.player.jukebox"),
                jukeboxActive,
                selectJukebox,
              )}

            {showUpnp && (
              <>
                <HStack className="items-center justify-between mt-2">
                  <Text className="text-sm text-primary-100">
                    {t("app.player.outputSpeakersAndTvs")}
                  </Text>
                  {upnpScanning ? (
                    <ActivityIndicator size="small" color={gray200} />
                  ) : (
                    <FadeOutScaleDown onPress={upnpSearch}>
                      <RefreshCw size={18} color={gray200} />
                    </FadeOutScaleDown>
                  )}
                </HStack>
                {upnpDevices.length === 0 ? (
                  <Text className="text-sm text-primary-100">
                    {upnpScanning
                      ? t("app.player.outputScanning")
                      : t("app.player.outputNoDevices")}
                  </Text>
                ) : (
                  upnpDevices.map((device) =>
                    outputRow(
                      device.id,
                      device.isTV ? (
                        <Tv
                          size={20}
                          color={
                            upnpDeviceId === device.id ? emerald500 : gray200
                          }
                        />
                      ) : (
                        <Speaker
                          size={20}
                          color={
                            upnpDeviceId === device.id ? emerald500 : gray200
                          }
                        />
                      ),
                      device.name,
                      upnpDeviceId === device.id,
                      () => selectUpnpDevice(device),
                      // A device that never confirmed what it is may not take a
                      // track; saying so beats a tap that quietly does nothing.
                      device.verified
                        ? undefined
                        : t("app.player.outputUnverified"),
                    ),
                  )
                )}
              </>
            )}

            {canCast &&
              outputRow(
                "chromecast",
                <Cast size={20} color={gray200} />,
                t("app.player.outputChromecast"),
                false,
                openChromecastPicker,
              )}

            {jukeboxActive && (
              <VStack className="gap-y-2">
                <Text className="text-sm text-primary-100">
                  {t("app.player.jukeboxGain")}
                </Text>
                <GestureSlider
                  value={jukeboxGain}
                  onScrub={jukeboxSetGain}
                  onComplete={jukeboxCommitGain}
                />
                {jukeboxStatus && (
                  <Text className="text-sm text-primary-100 mt-2">
                    {t("app.player.jukeboxStatus", {
                      state: jukeboxStatus.playing
                        ? t("app.player.jukeboxStatePlaying")
                        : t("app.player.jukeboxStatePaused"),
                      index: (jukeboxStatus.currentIndex ?? 0) + 1,
                      total: queueLength,
                    })}
                  </Text>
                )}
              </VStack>
            )}

            {upnpConnected && (
              <VStack className="gap-y-2">
                <Text className="text-sm text-primary-100">
                  {t("app.player.jukeboxGain")}
                </Text>
                <GestureSlider
                  value={upnpVolume}
                  onScrub={upnpSetVolume}
                  onComplete={upnpSetVolume}
                />
              </VStack>
            )}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </BottomSheetModalComponent>
  );
}
