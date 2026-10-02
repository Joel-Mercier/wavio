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
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable } from "react-native";
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
import { castDisconnect, castSetVolume } from "@/services/cast";
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
  upnpConnectMultiple,
  upnpDisconnect,
  upnpDisconnectDevice,
  upnpSearch,
  upnpSetDeviceVolume,
  upnpSetVolume,
  upnpStartDiscovery,
  upnpStopDiscovery,
  upnpSupportsDeviceVolume,
} from "@/services/upnp";
import useCast from "@/stores/cast";
import useJukebox from "@/stores/jukebox";
import useQueue from "@/stores/queue";
import useUpnp from "@/stores/upnp";
import { logError } from "@/utils/log";
import { TOAST_DURATION } from "@/utils/toastDuration";

// Hard-coded strings for the output sheet. These previously used
// t("app.player.output*") keys that were resolving to raw key names.
const OUTPUT_MASTER = "Master";
const OUTPUT_CONNECT = "Connect";
const OUTPUT_CONNECTING = "Connecting...";
const OUTPUT_DISCONNECT = "Disconnect";
const OUTPUT_DISCONNECTING = "Disconnecting...";
const OUTPUT_DISCONNECT_ERROR = "Failed to disconnect from device";
const OUTPUT_CANCEL = "Cancel";
const OUTPUT_INDIVIDUAL_VOLUME = "Volume";
const OUTPUT_GROUP_VOLUME = "Group volume";

// Module-level ref for root mounting
let mountedSheetRef: RefObject<BottomSheetModal | null> | null = null;
let mountedOnOpen: (() => void) | null = null;

export function openOutputSheet() {
  mountedOnOpen?.();
  mountedSheetRef?.current?.present();
}

export function closeOutputSheet() {
  mountedSheetRef?.current?.dismiss();
}

export default function OutputSheet() {
  const { t } = useTranslation();
  const toast = useToast();
  const [emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
  const sheetRef = useRef<BottomSheetModal>(null);
  const capabilities = useCapabilities();
  const casting = useCast((s) => s.active);
  const castDeviceName = useCast((s) => s.deviceName);
  const castVolume = useCast((s) => s.volume);
  const castAvailable = useCast((s) => s.available);
  const jukeboxActive = useJukebox((s) => s.active);
  const jukeboxGain = useJukebox((s) => s.gain);
  const jukeboxStatus = useJukebox((s) => s.status);
  const queueLength = useQueue((s) => s.queue.length);

  const jukeboxCanPlayCurrent = useQueue((s) => {
    const track = s.currentIndex == null ? null : s.queue[s.currentIndex];
    return !track?.isRadio && track?.source !== "podcast";
  });

  const upnpConnected = useUpnp((s) => s.connected);
  const upnpDeviceId = useUpnp((s) => s.deviceId);
  const rawUpnpDeviceIds = useUpnp((s) => s.deviceIds);
  const upnpDevices = useUpnp((s) => s.devices);
  const upnpScanning = useUpnp((s) => s.scanning);
  const upnpVolume = useUpnp((s) => s.volume);

  // Derive all active connected UPnP device IDs cleanly
  const upnpDeviceIds = useMemo(() => {
    if (Array.isArray(rawUpnpDeviceIds) && rawUpnpDeviceIds.length > 0) {
      return rawUpnpDeviceIds;
    }
    return upnpDeviceId ? [upnpDeviceId] : [];
  }, [rawUpnpDeviceIds, upnpDeviceId]);

  const masterId = upnpDeviceId || upnpDeviceIds[0] || null;
  const hasMultipleDevices = upnpDeviceIds.length > 1;

  // Whether this build can set a renderer's volume on its own.
  // Hidden per-device sliders are more honest than a slider that pushes the
  // group value under a per-device label.
  const supportsDeviceVolume = useMemo(() => upnpSupportsDeviceVolume(), []);

  const [selectedUpnpIds, setSelectedUpnpIds] = useState<string[]>([]);
  const [isConnectingUpnp, setIsConnectingUpnp] = useState(false);
  const [disconnectingDeviceId, setDisconnectingDeviceId] = useState<
    string | null
  >(null);
  const [isSelectingUpnp, setIsSelectingUpnp] = useState(false);

  // Per-device volumes, keyed by device id. Mirrors what we last pushed to
  // each device (or inherited from the group on first sight). The store only
  // holds the group volume; these are local to the sheet.
  const [deviceVolumes, setDeviceVolumes] = useState<Record<string, number>>(
    {},
  );

  const canCast = capabilities.remoteStreamableUrl;
  const showUpnp = canCast && isUpnpAvailable();
  const playingLocally = !jukeboxActive && !upnpConnected && !casting;

  useEffect(() => {
    mountedSheetRef = sheetRef;
    mountedOnOpen = () => {
      if (showUpnp) upnpStartDiscovery();
    };
    return () => {
      mountedSheetRef = null;
      mountedOnOpen = null;
    };
  }, [showUpnp]);

  // Sync selection mode state whenever connected devices change
  useEffect(() => {
    if (!isSelectingUpnp) {
      setSelectedUpnpIds(upnpDeviceIds);
    }
  }, [upnpDeviceIds, isSelectingUpnp]);

  // Seed per-device volumes: new devices inherit the current group volume,
  // and stale entries for disconnected devices are dropped.
  useEffect(() => {
    setDeviceVolumes((prev) => {
      let changed = false;
      const next: Record<string, number> = {};

      for (const id of upnpDeviceIds) {
        if (id in prev) {
          next[id] = prev[id];
        } else {
          next[id] = upnpVolume;
          changed = true;
        }
      }

      if (!changed) {
        for (const id of Object.keys(prev)) {
          if (!(id in next)) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [upnpDeviceIds, upnpVolume]);

  const enterSelectionMode = useCallback(() => {
    setSelectedUpnpIds([...upnpDeviceIds]);
    setIsSelectingUpnp(true);
  }, [upnpDeviceIds]);

  const exitSelectionMode = useCallback(() => {
    setIsSelectingUpnp(false);
    setSelectedUpnpIds([...upnpDeviceIds]);
  }, [upnpDeviceIds]);

  const showError = useCallback(
    (message: string) => {
      toast.show({
        placement: "top",
        duration: TOAST_DURATION.default,
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

  const releaseCurrentOutput = useCallback(async () => {
    if (jukeboxActive) await takeOverLocally();
    if (upnpConnected) await upnpDisconnect();
    if (casting) await castDisconnect();
  }, [casting, jukeboxActive, upnpConnected]);

  const selectLocal = async () => {
    if (playingLocally) return;
    try {
      await releaseCurrentOutput();
    } catch (e) {
      logError(e);
    }
    exitSelectionMode();
    sheetRef.current?.dismiss();
  };

  const selectJukebox = async () => {
    if (jukeboxActive) return;
    try {
      await releaseCurrentOutput();
    } catch (e) {
      logError(e);
    }
    exitSelectionMode();
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

  const toggleUpnpDevice = useCallback(
    (device: UpnpDevice) => {
      if (!isSelectingUpnp) {
        setIsSelectingUpnp(true);
        const alreadyConnected = upnpDeviceIds.includes(device.id);
        const initial = alreadyConnected
          ? upnpDeviceIds.filter((id) => id !== device.id)
          : [...upnpDeviceIds, device.id];
        setSelectedUpnpIds(initial);
        return;
      }

      setSelectedUpnpIds((prev) =>
        prev.includes(device.id)
          ? prev.filter((id) => id !== device.id)
          : [...prev, device.id],
      );
    },
    [isSelectingUpnp, upnpDeviceIds],
  );

  const applyUpnpSelection = async () => {
    if (selectedUpnpIds.length === 0) {
      try {
        await releaseCurrentOutput();
      } catch (e) {
        logError(e);
      }
      exitSelectionMode();
      sheetRef.current?.dismiss();
      return;
    }

    setIsConnectingUpnp(true);
    try {
      await releaseCurrentOutput();
    } catch (e) {
      logError(e);
    }

    const selectedDevices = upnpDevices.filter((candidate) =>
      selectedUpnpIds.includes(candidate.id),
    );

    const connected =
      selectedDevices.length > 1
        ? await upnpConnectMultiple(selectedDevices)
        : selectedDevices.length === 1
          ? await upnpConnect(selectedDevices[0])
          : false;

    setIsConnectingUpnp(false);

    if (!connected) {
      showError(
        t("app.player.outputConnectErrorMessage", {
          name: selectedDevices.map((d) => d.name).join(", "),
        }),
      );
      return;
    }

    setIsSelectingUpnp(false);
    sheetRef.current?.dismiss();
  };

  // Disconnect a single device. The service decides whether that means "drop
  // the whole group" (master, or last remaining) or "reconnect without it".
  const handleDisconnectDevice = async (deviceId: string) => {
    setDisconnectingDeviceId(deviceId);
    try {
      await upnpDisconnectDevice(deviceId);
      setDeviceVolumes((prev) => {
        const next = { ...prev };
        delete next[deviceId];
        return next;
      });
      exitSelectionMode();
    } catch (e) {
      logError(e);
      showError(OUTPUT_DISCONNECT_ERROR);
    } finally {
      setDisconnectingDeviceId(null);
    }
  };

  const setIndividualVolume = useCallback((deviceId: string, volume: number) => {
    setDeviceVolumes((prev) => ({ ...prev, [deviceId]: volume }));
    upnpSetDeviceVolume(deviceId, volume);
  }, []);

  // Fan the same value out to every connected device.
  const setGroupVolume = useCallback((volume: number) => {
    setDeviceVolumes((prev) => {
      const next: Record<string, number> = {};
      for (const id of Object.keys(prev)) next[id] = volume;
      return next;
    });
    upnpSetVolume(volume);
  }, []);

  const openChromecastPicker = async () => {
    if (castAvailable === false) {
      showError(t("app.player.outputChromecastNoPlayServices"));
      return;
    }
    try {
      const shown = await CastContext.showCastDialog();
      if (!shown) showError(t("app.player.outputChromecastUnavailable"));
    } catch (e) {
      logError(e);
      showError(t("app.player.outputChromecastUnavailable"));
    }
  };

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index < 0) {
        if (showUpnp) upnpStopDiscovery();
        if (isSelectingUpnp) {
          exitSelectionMode();
        }
        return;
      }
      if (capabilities.jukebox) {
        jukeboxRefreshStatus().catch(() => {});
        if (useJukebox.getState().active) {
          jukeboxReconcileFromServer().catch(() => {});
        }
      }
    },
    [capabilities.jukebox, showUpnp, isSelectingUpnp, exitSelectionMode],
  );

  const outputRow = (
    key: string,
    icon: React.ReactNode,
    label: string,
    selected: boolean,
    onPress: () => void,
    subtitle?: string,
    isMaster?: boolean,
    badgeText?: string,
  ) => (
    <FadeOutScaleDown key={key} onPress={onPress}>
      <HStack className="items-center justify-between">
        <HStack className="items-center flex-1 mr-4">
          {icon}
          <VStack className="ml-4 flex-1">
            <HStack className="items-center gap-x-2">
              <Text
                className="text-lg"
                numberOfLines={1}
                style={{ color: selected ? emerald500 : gray200 }}
              >
                {label}
              </Text>
              {selected && isMaster && (
                <Text className="text-xs text-emerald-500 font-semibold">
                  {OUTPUT_MASTER}
                </Text>
              )}
              {selected && !isMaster && badgeText && (
                <Text className="text-xs text-emerald-500 font-semibold">
                  {badgeText}
                </Text>
              )}
            </HStack>
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

  const hasUpnpSelection = selectedUpnpIds.length > 0;

  return (
    <BottomSheetModalComponent
      ref={sheetRef}
      onChange={handleSheetChange}
      enableHalfExpand={false}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center" }}
      >
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
              (jukeboxActive || jukeboxCanPlayCurrent) &&
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
                  <>
                    {upnpDevices.map((device) => {
                      const isConnected = upnpDeviceIds.includes(device.id);
                      const isSelected = isSelectingUpnp
                        ? selectedUpnpIds.includes(device.id)
                        : isConnected;

                      const currentMasterId = isSelectingUpnp
                        ? selectedUpnpIds[0]
                        : masterId;

                      const isMasterDevice =
                        !!currentMasterId && device.id === currentMasterId;

                      const badgeText =
                        isSelected && !isMasterDevice
                          ? t("app.player.outputChromecastConnected")
                          : undefined;

                      const isDisconnectingThis =
                        disconnectingDeviceId === device.id;
                      const anyDisconnecting =
                        disconnectingDeviceId !== null;

                      const deviceVolume =
                        deviceVolumes[device.id] ?? upnpVolume;

                      return (
                        <VStack key={`device-${device.id}`} className="gap-y-2">
                          {outputRow(
                            device.id,
                            device.isTV ? (
                              <Tv
                                size={20}
                                color={isSelected ? emerald500 : gray200}
                              />
                            ) : (
                              <Speaker
                                size={20}
                                color={isSelected ? emerald500 : gray200}
                              />
                            ),
                            device.name,
                            isSelected,
                            () => toggleUpnpDevice(device),
                            undefined,
                            isMasterDevice && isSelected,
                            badgeText,
                          )}
                          {!isSelectingUpnp && isConnected && (
                            <VStack className="ml-8 gap-y-3">
                              {supportsDeviceVolume && (
                                <VStack className="gap-y-2">
                                  <Text className="text-sm text-primary-100">
                                    {OUTPUT_INDIVIDUAL_VOLUME}
                                  </Text>
                                  <GestureSlider
                                    value={deviceVolume}
                                    onScrub={(v) =>
                                      setIndividualVolume(device.id, v)
                                    }
                                    onComplete={(v) =>
                                      setIndividualVolume(device.id, v)
                                    }
                                  />
                                </VStack>
                              )}

                              <Pressable
                                onPress={() =>
                                  handleDisconnectDevice(device.id)
                                }
                                disabled={anyDisconnecting}
                                style={({ pressed }) => ({
                                  opacity: pressed ? 0.7 : 1,
                                })}
                                className="bg-red-600 rounded-lg py-2 px-3 flex-row items-center justify-center gap-x-2"
                              >
                                {isDisconnectingThis ? (
                                  <>
                                    <ActivityIndicator
                                      size="small"
                                      color="white"
                                    />
                                    <Text className="text-white text-sm font-semibold">
                                      {OUTPUT_DISCONNECTING}
                                    </Text>
                                  </>
                                ) : (
                                  <>
                                    <X size={16} color="white" />
                                    <Text className="text-white text-sm font-semibold">
                                      {OUTPUT_DISCONNECT}
                                    </Text>
                                  </>
                                )}
                              </Pressable>
                            </VStack>
                          )}
                        </VStack>
                      );
                    })}
                    {isSelectingUpnp && (
                      <HStack className="gap-x-2 mt-4">
                        <Pressable
                          onPress={exitSelectionMode}
                          disabled={isConnectingUpnp}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.7 : 1,
                          })}
                          className="flex-1 bg-gray-600 rounded-lg py-3 px-4"
                        >
                          <Text className="text-white font-semibold text-center">
                            {OUTPUT_CANCEL}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={applyUpnpSelection}
                          disabled={isConnectingUpnp || !hasUpnpSelection}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.7 : 1,
                          })}
                          className="flex-1 bg-emerald-600 rounded-lg py-3 px-4"
                        >
                          {isConnectingUpnp ? (
                            <HStack className="items-center justify-center gap-x-2">
                              <ActivityIndicator size="small" color="white" />
                              <Text className="text-white font-semibold">
                                {OUTPUT_CONNECTING}
                              </Text>
                            </HStack>
                          ) : (
                            <Text className="text-white font-semibold text-center">
                              {OUTPUT_CONNECT}
                              {selectedUpnpIds.length > 1
                                ? ` (${selectedUpnpIds.length})`
                                : ""}
                            </Text>
                          )}
                        </Pressable>
                      </HStack>
                    )}
                  </>
                )}
              </>
            )}

            {canCast &&
              outputRow(
                "chromecast",
                <Cast size={20} color={casting ? emerald500 : gray200} />,
                (casting && castDeviceName) || t("app.player.outputChromecast"),
                casting,
                openChromecastPicker,
                casting
                  ? t("app.player.outputChromecastConnected")
                  : castAvailable === false
                    ? t("app.player.outputChromecastNoPlayServicesHint")
                    : undefined,
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

            {upnpConnected && hasMultipleDevices && !isSelectingUpnp && (
              <VStack className="gap-y-2">
                <Text className="text-sm text-primary-100">
                  {OUTPUT_GROUP_VOLUME}
                </Text>
                <GestureSlider
                  value={(() => {
                    const ids = upnpDeviceIds;
                    if (ids.length === 0) return upnpVolume;
                    const sum = ids.reduce(
                      (acc, id) => acc + (deviceVolumes[id] ?? upnpVolume),
                      0,
                    );
                    return sum / ids.length;
                  })()}
                  onScrub={setGroupVolume}
                  onComplete={setGroupVolume}
                />
              </VStack>
            )}

            {casting && (
              <VStack className="gap-y-2">
                <Text className="text-sm text-primary-100">
                  {t("app.player.jukeboxGain")}
                </Text>
                <GestureSlider
                  value={castVolume}
                  onScrub={castSetVolume}
                  onComplete={castVolume}
                />
              </VStack>
            )}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </BottomSheetModalComponent>
  );
}