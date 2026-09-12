import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns/parseISO";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { scanErrorKey, scanStepKey } from "@/components/local/scanStep";
import ArtNamesField from "@/components/settings/ArtNamesField";
import OptionsBottomSheetModal from "@/components/settings/OptionsBottomSheetModal";
import {
  SettingsActionRow,
  SettingsSelectRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useGetScanStatus,
  useStartScan,
} from "@/hooks/backend/useMediaLibraryScanning";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import {
  isIndexBackedType,
  isNetworkShareType,
} from "@/services/backend/serverTraits";
import {
  DEFAULT_ALBUM_ART_NAMES,
  DEFAULT_ARTIST_ART_NAMES,
  formatArtNames,
} from "@/services/local/artNames";
import { runLibraryReconcileScan } from "@/services/local/mediaLibraryScanning";
import { isSubsonicNotAuthorized } from "@/services/openSubsonic";
import useApp from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import useLocalLibrary from "@/stores/localLibrary";
import { formatDistanceToNow } from "@/utils/date";
import { logError } from "@/utils/log";

const autoSyncIntervalOptions = [15, 30, 60, 360, 1440];

export default function MusicLibrarySection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const indexBacked = useAuthBase((store) =>
    isIndexBackedType(store.serverType),
  );
  const serverType = useAuthBase((store) => store.serverType);
  // A library that is index-backed *and* reached over the network: the only kind
  // whose scan costs bandwidth, so the only one the Wi-Fi guard applies to.
  const networkShare = isNetworkShareType(serverType);
  const scanOnWifiOnly = useApp((store) => store.scanOnWifiOnly);
  const setScanOnWifiOnly = useApp((store) => store.setScanOnWifiOnly);
  const albumArtNames = useApp((store) => store.albumArtNames);
  const setAlbumArtNames = useApp((store) => store.setAlbumArtNames);
  const artistArtNames = useApp((store) => store.artistArtNames);
  const setArtistArtNames = useApp((store) => store.setArtistArtNames);
  const autoLibrarySync = useApp((store) => store.autoLibrarySync);
  const setAutoLibrarySync = useApp((store) => store.setAutoLibrarySync);
  const autoSyncInterval = useApp(
    (store) => store.autoLibrarySyncIntervalMinutes,
  );
  const setAutoSyncInterval = useApp(
    (store) => store.setAutoLibrarySyncIntervalMinutes,
  );
  const localScanStatus = useLocalLibrary((store) => store.status);
  const lastScanAt = useLocalLibrary((store) => store.lastScanAt);
  const localScanning = localScanStatus.phase !== "idle";
  const hasNavidromeNative = useAuthBase((store) => store.hasNavidromeNative);
  const isAdmin = useAuthBase((store) => store.isAdmin);
  // Navidrome restricts startScan to admins (code 50 otherwise). When native
  // login confirmed a non-admin account, disable the scan action up front. When
  // native login didn't run (pure OpenSubsonic / fallback), isAdmin is
  // unreliable, so leave it enabled and let the error toast explain a failure.
  const scanRequiresAdmin =
    serverType === "navidrome" && hasNavidromeNative && !isAdmin;
  const doStartScan = useStartScan();
  const { data } = useGetScanStatus();
  const bottomSheetAutoSyncModalRef = useRef<BottomSheetModal>(null);

  // A sync started from here, still waiting to be told how it went. The scan is
  // fire-and-forget, so a failure only ever lands in `status.errorCode` — which
  // nothing on this screen renders, and which the full-screen gate isn't open to
  // show either.
  const syncRequested = useRef(false);

  // The incremental scan: only files whose size or mtime changed are re-read, so
  // this costs one directory listing per folder and usually nothing else. Runs
  // in the background — no gate, no blocked UI.
  const handleSyncNowPress = async () => {
    syncRequested.current = true;
    // Clears any error left by an earlier attempt, so the watcher below can't
    // report a stale one against this press — and marks the request in flight,
    // which is what stops that watcher firing before the scan has begun.
    useLocalLibrary
      .getState()
      .setStatus({ phase: "listing", processed: 0, total: 0 });
    const { scanStatus } = await runLibraryReconcileScan(false);
    if (!scanStatus.scanning) return;
    showSuccessToast(
      t("app.settings.musicLibrarySettings.syncNowSuccessDescription"),
    );
  };

  // Both the refusals (Wi-Fi only on mobile data, no folders configured) and the
  // failures (rejected credentials, share gone mid-scan) surface the same way.
  useEffect(() => {
    if (!syncRequested.current) return;
    if (localScanning) return;
    if (!localScanStatus.errorCode) {
      // A scan that finished cleanly stops us watching for its failure.
      if (localScanStatus.phase === "idle") syncRequested.current = false;
      return;
    }
    syncRequested.current = false;
    showErrorToast(t(scanErrorKey(localScanStatus.errorCode)));
  }, [localScanning, localScanStatus, showErrorToast, t]);

  // The expensive one: re-extracts tags from every file, behind the full-screen
  // indexing gate, so newly supported tag fields land on already-indexed files.
  const handleFullRescanPress = () => {
    useLocalLibrary.getState().requestRescan(true);
  };

  const handleMediaLibraryScanPress = () => {
    doStartScan.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries();
        showSuccessToast(
          t(
            "app.settings.musicLibrarySettings.scanMusicLibrarySuccessDescription",
          ),
        );
      },
      onError: (error) => {
        logError(error);
        // Navidrome (and other Subsonic servers) return code 50 when a non-admin
        // triggers a scan — tell the user admin rights are required rather than
        // showing the generic failure message.
        showErrorToast(
          t(
            isSubsonicNotAuthorized(error)
              ? "app.settings.musicLibrarySettings.scanMusicLibraryAdminRequiredDescription"
              : "app.settings.musicLibrarySettings.scanMusicLibraryErrorDescription",
          ),
        );
      },
    });
  };

  return (
    <SettingsScreenScaffold title={t("app.settings.menu.library.title")}>
      <VStack className="gap-y-4">
        {indexBacked ? (
          <>
            <SettingsActionRow
              layout="wide"
              label={t("app.settings.musicLibrarySettings.syncNowLabel")}
              description={t(
                "app.settings.musicLibrarySettings.syncNowDescription",
              )}
              actionLabel={t("app.settings.musicLibrarySettings.syncNowAction")}
              onPress={() => void handleSyncNowPress()}
              disabled={localScanning}
            />
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.musicLibrarySettings.scanStatusLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {localScanning
                    ? t(scanStepKey(localScanStatus.phase))
                    : lastScanAt
                      ? t(
                          "app.settings.musicLibrarySettings.scanStatusLastScan",
                          {
                            lastScan: formatDistanceToNow(new Date(lastScanAt)),
                          },
                        )
                      : t(
                          "app.settings.musicLibrarySettings.scanStatusNeverDescription",
                        )}
                </Text>
                {localScanning &&
                localScanStatus.phase === "indexing" &&
                localScanStatus.total > 0 ? (
                  <Text className="text-primary-300 text-xs">
                    {t("app.localIndexing.countLabel", {
                      processed: localScanStatus.processed,
                      total: localScanStatus.total,
                    })}
                  </Text>
                ) : null}
                {localScanning &&
                localScanStatus.phase === "listing" &&
                (localScanStatus.directories ?? 0) > 0 ? (
                  <Text className="text-primary-300 text-xs">
                    {t("app.localIndexing.folderCountLabel", {
                      count: localScanStatus.directories ?? 0,
                    })}
                  </Text>
                ) : null}
              </VStack>
              <Badge
                className="rounded-full normal-case py-1 px-3 bg-emerald-100"
                size="lg"
                variant="solid"
                action={localScanning ? "warning" : "success"}
              >
                <BadgeText className="normal-case text-center text-emerald-700">
                  {t(
                    localScanning
                      ? "app.settings.musicLibrarySettings.scanStatuses.scanning"
                      : "app.settings.musicLibrarySettings.scanStatuses.idle",
                  )}
                </BadgeText>
              </Badge>
            </HStack>
            <SettingsToggleRow
              label={t("app.settings.musicLibrarySettings.autoSyncLabel")}
              description={t(
                "app.settings.musicLibrarySettings.autoSyncDescription",
              )}
              value={autoLibrarySync}
              onToggle={setAutoLibrarySync}
            />
            {autoLibrarySync && (
              <SettingsSelectRow
                label={t(
                  "app.settings.musicLibrarySettings.autoSyncIntervalLabel",
                )}
                description={t(
                  "app.settings.musicLibrarySettings.autoSyncIntervalDescription",
                )}
                badgeText={t(
                  `app.settings.musicLibrarySettings.autoSyncIntervalOptions.${autoSyncInterval}`,
                )}
                onPress={() => bottomSheetAutoSyncModalRef.current?.present()}
              />
            )}
            {networkShare && (
              <SettingsToggleRow
                label={t(
                  "app.settings.musicLibrarySettings.scanOnWifiOnlyLabel",
                )}
                description={t(
                  "app.settings.musicLibrarySettings.scanOnWifiOnlyDescription",
                )}
                value={scanOnWifiOnly}
                onToggle={setScanOnWifiOnly}
              />
            )}
            {/* The only place the ignore-file convention is discoverable: it's a
                file the user puts on the share, so nothing in the app would ever
                hint at it otherwise. */}
            <VStack className="gap-y-2 py-4">
              <Heading className="text-white font-normal" size="md">
                {t("app.settings.musicLibrarySettings.ignoreFilesLabel")}
              </Heading>
              <Text className="text-primary-100 text-sm">
                {t("app.settings.musicLibrarySettings.ignoreFilesDescription")}
              </Text>
            </VStack>
            {/* Same reasoning as the ignore paragraph above, with an editor
                attached: the conventions are invisible until something names
                them, and a library tagged for a player with a different list
                needs that list rather than a rescan. */}
            <VStack className="gap-y-2 py-4">
              <Heading className="text-white font-normal" size="md">
                {t("app.settings.musicLibrarySettings.coverArtLabel")}
              </Heading>
              <Text className="text-primary-100 text-sm">
                {t("app.settings.musicLibrarySettings.coverArtDescription")}
              </Text>
            </VStack>
            <ArtNamesField
              label={t("app.settings.musicLibrarySettings.albumArtNamesLabel")}
              placeholder={formatArtNames(DEFAULT_ALBUM_ART_NAMES)}
              value={albumArtNames}
              onSave={setAlbumArtNames}
              disabled={localScanning}
            />
            <ArtNamesField
              label={t("app.settings.musicLibrarySettings.artistArtNamesLabel")}
              placeholder={formatArtNames(DEFAULT_ARTIST_ART_NAMES)}
              value={artistArtNames}
              onSave={setArtistArtNames}
              disabled={localScanning}
            />
            <SettingsActionRow
              layout="wide"
              variant="danger"
              label={t("app.settings.musicLibrarySettings.fullRescanLabel")}
              description={t(
                "app.settings.musicLibrarySettings.fullRescanDescription",
              )}
              actionLabel={t(
                "app.settings.musicLibrarySettings.fullRescanAction",
              )}
              onPress={handleFullRescanPress}
              disabled={localScanning}
            />
            <OptionsBottomSheetModal
              modalRef={bottomSheetAutoSyncModalRef}
              header={t(
                "app.settings.musicLibrarySettings.autoSyncIntervalLabel",
              )}
              headerDescription={t(
                "app.settings.musicLibrarySettings.autoSyncIntervalDescription",
              )}
              options={autoSyncIntervalOptions.map((option) => ({
                value: option,
                label: t(
                  `app.settings.musicLibrarySettings.autoSyncIntervalOptions.${option}`,
                ),
              }))}
              selectedValue={autoSyncInterval}
              onSelect={setAutoSyncInterval}
              dismissOnSelect
            />
          </>
        ) : (
          <>
            <SettingsActionRow
              layout="wide"
              label={t(
                "app.settings.musicLibrarySettings.scanMusicLibraryLabel",
              )}
              description={t(
                scanRequiresAdmin
                  ? "app.settings.musicLibrarySettings.scanMusicLibraryAdminRequiredDescription"
                  : "app.settings.musicLibrarySettings.scanMusicLibraryDescription",
              )}
              actionLabel={t(
                "app.settings.musicLibrarySettings.scanMusicLibraryAction",
              )}
              onPress={handleMediaLibraryScanPress}
              disabled={scanRequiresAdmin}
            />
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.musicLibrarySettings.scanStatusLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.musicLibrarySettings.scanStatusDescription")}
                </Text>
                {data?.scanStatus?.lastScan && (
                  <Text className="text-primary-100 text-sm">
                    {t("app.settings.musicLibrarySettings.scanStatusLastScan", {
                      lastScan: formatDistanceToNow(
                        parseISO(data?.scanStatus?.lastScan || ""),
                      ),
                    })}
                  </Text>
                )}
              </VStack>
              <Badge
                className="rounded-full normal-case py-1 px-3 bg-emerald-100"
                size="lg"
                variant="solid"
                action={data?.scanStatus?.scanning ? "warning" : "success"}
              >
                <BadgeText className="normal-case text-center text-emerald-700">
                  {data?.scanStatus?.scanning
                    ? t(
                        "app.settings.musicLibrarySettings.scanStatuses.scanning",
                      )
                    : t("app.settings.musicLibrarySettings.scanStatuses.idle")}
                </BadgeText>
              </Badge>
            </HStack>
          </>
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
