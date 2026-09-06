import { useQueryClient } from "@tanstack/react-query";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SettingsNotice from "@/components/settings/SettingsNotice";
import {
  SettingsActionRow,
  SettingsSectionTitle,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { STARRED_AFFECTED_KEYS } from "@/hooks/backend/useMediaAnnotation";
import { useLastFmLovedTracks } from "@/hooks/lastFm/useLastFmLovedTracks";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useIsDeviceOnline, useIsOnline } from "@/hooks/useIsOnline";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { connectLastFm, disconnectLastFm } from "@/services/lastFm/auth";
import {
  hasLastFmCredentials,
  LASTFM_SETTINGS_URL,
} from "@/services/lastFm/config";
import {
  importLovedTracks,
  type LovedImportProgress,
  type LovedImportResult,
  MAX_IMPORTED_LOVES,
} from "@/services/lastFm/lovedImport";
import { drainLastFmQueue } from "@/services/lastFm/scrobbler";
import { refreshLastFmServerState } from "@/services/lastFm/serverState";
import useLastFm from "@/stores/lastFm";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { invalidateKeys } from "@/utils/invalidateKeys";
import { AbortedError } from "@/utils/rateLimitedQueue";
import { cn } from "@/utils/tailwind";

const KEY = "app.settings.integrations.lastfm";

export default function LastFmScreen() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];

  const userName = useLastFm((store) => store.userName);
  const sessionKey = useLastFm((store) => store.sessionKey);
  const sessionInvalid = useLastFm((store) => store.sessionInvalid);
  const scrobblingEnabled = useLastFm((store) => store.scrobblingEnabled);
  const submitNowPlaying = useLastFm((store) => store.submitNowPlaying);
  const syncLoves = useLastFm((store) => store.syncLoves);
  const setScrobblingEnabled = useLastFm((store) => store.setScrobblingEnabled);
  const setSubmitNowPlaying = useLastFm((store) => store.setSubmitNowPlaying);
  const setSyncLoves = useLastFm((store) => store.setSyncLoves);
  const serverIsScrobbling = useLastFm((store) => store.serverIsScrobbling);
  const queuedCount = useLastFm(
    (store) => store.queue.length + store.loveQueue.length,
  );

  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [importProgress, setImportProgress] =
    useState<LovedImportProgress | null>(null);
  const [importResult, setImportResult] = useState<LovedImportResult | null>(
    null,
  );
  const importAbortRef = useRef<AbortController | null>(null);
  const isConnected = sessionKey.length > 0 && userName !== null;
  const canConnect = hasLastFmCredentials();

  const queryClient = useQueryClient();
  const musicFolderId = useCurrentMusicFolderId();
  const { multiFieldSearch } = useCapabilities();
  // Reading the loves needs the device online; favouriting the matches needs the
  // music server too, and only the effective value knows about that (a local
  // library is always effectively online, which is exactly right here).
  const isServerReachable = useIsOnline();
  const isDeviceOnline = useIsDeviceOnline();
  const canImport = isServerReachable && isDeviceOnline;
  const lovedTracks = useLastFmLovedTracks({ enabled: isConnected });

  // Ask the server whether it is already scrobbling, so the warning below is
  // current rather than whatever the last visit recorded.
  useEffect(() => {
    void refreshLastFmServerState();
  }, []);

  const handleConnect = async () => {
    const wasConnected = isConnected;
    setIsConnecting(true);
    try {
      const result = await connectLastFm();
      if (result.status === "notAuthorized") {
        // The user closed the browser without approving. Not an error — the
        // handshake simply hasn't finished, and tapping Connect starts a new one.
        showErrorToast(t(`${KEY}.auth.notAuthorized`));
        return;
      }
      // Default scrobbling on, unless the server is already doing it for this
      // user — in which case turning it on would count every play twice, so the
      // user has to opt in deliberately. Only on the *first* connection:
      // reconnecting a revoked session must not silently undo a choice the user
      // already made, least of all when the server is unreachable and
      // refreshLastFmServerState can only answer null.
      if (!wasConnected) {
        const alreadyScrobbling = await refreshLastFmServerState();
        setScrobblingEnabled(alreadyScrobbling !== true);
      } else {
        void refreshLastFmServerState();
      }
      showSuccessToast(
        t(`${KEY}.auth.connected`, { userName: result.userName }),
      );
    } catch {
      showErrorToast(t(`${KEY}.auth.failed`));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await drainLastFmQueue();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = () => {
    disconnectLastFm();
    showSuccessToast(t(`${KEY}.auth.disconnected`));
  };

  // A full import can run for minutes, so leaving the screen has to stop it
  // rather than let it keep hammering the server behind the user's back.
  useEffect(() => () => importAbortRef.current?.abort(), []);

  const handleImportLoves = async () => {
    if (!userName) return;
    const controller = new AbortController();
    importAbortRef.current = controller;
    const stillMounted = () => !controller.signal.aborted;
    setImportResult(null);
    setImportProgress({ phase: "fetching", done: 0, total: 0 });
    try {
      const result = await importLovedTracks({
        userName,
        musicFolderId,
        multiFieldSearch,
        signal: controller.signal,
        onProgress: (progress) => {
          if (stillMounted()) setImportProgress(progress);
        },
      });
      if (!stillMounted()) return;
      setImportResult(result);
      showSuccessToast(
        result.starred > 0
          ? t(`${KEY}.loves.importAdded`, { count: result.starred })
          : t(`${KEY}.loves.importNothingNew`),
      );
      if (result.starred > 0) {
        invalidateKeys(queryClient, STARRED_AFFECTED_KEYS);
      }
    } catch (error) {
      // An abort is the screen being left, not a failure worth a toast.
      if (!stillMounted() || error instanceof AbortedError) return;
      showErrorToast(t(`${KEY}.loves.importFailed`));
    } finally {
      if (stillMounted()) setImportProgress(null);
      importAbortRef.current = null;
    }
  };

  const importProgressLabel = () => {
    if (!importProgress) return null;
    if (importProgress.phase === "matching") {
      return t(`${KEY}.loves.importProgressMatching`);
    }
    const key =
      importProgress.phase === "fetching"
        ? "importProgressFetching"
        : "importProgressStarring";
    // Pluralised on the total, not on the running count: "1 of 12" is plural.
    return t(`${KEY}.loves.${key}`, {
      done: importProgress.done,
      count: importProgress.total,
    });
  };

  return (
    <SettingsScreenScaffold title={t(`${KEY}.title`)}>
      <VStack className="gap-y-4">
        <HStack className="items-center justify-between py-2">
          <Text className="text-primary-100 text-sm w-3/5">
            {t(`${KEY}.description`)}
          </Text>
          <Badge
            className={cn(
              "rounded-full normal-case py-1 px-3",
              isConnected ? "bg-emerald-100" : "bg-primary-100",
            )}
            size="lg"
            variant="solid"
            action={isConnected ? "success" : "muted"}
          >
            <BadgeText
              className={cn(
                "normal-case text-center",
                isConnected ? "text-emerald-700" : "text-primary-700",
              )}
            >
              {isConnected
                ? t("app.settings.integrations.statuses.configured")
                : t("app.settings.integrations.statuses.notConfigured")}
            </BadgeText>
          </Badge>
        </HStack>

        {isConnected && userName && (
          <Text className="text-primary-100 text-sm">
            {t(`${KEY}.auth.signedInAs`, { userName })}
          </Text>
        )}

        {/* A build made without the API credentials can't reach Last.fm at all,
            so say that rather than failing at the first request. */}
        {!canConnect && (
          <SettingsNotice message={t(`${KEY}.auth.noCredentials`)} />
        )}

        {sessionInvalid && (
          <SettingsNotice message={t(`${KEY}.auth.sessionExpired`)} />
        )}

        <Text className="text-primary-100 text-xs">
          {t(`${KEY}.auth.browserHint`)}
        </Text>

        <HStack className="items-center justify-center gap-x-4 mt-2">
          <FadeOutScaleDown
            disabled={isConnecting || !canConnect}
            onPress={() => {
              if (!isConnecting && canConnect) void handleConnect();
            }}
            className={cn(
              "items-center justify-center py-3 px-8 rounded-full border",
              canConnect
                ? "border-emerald-500 bg-emerald-500"
                : "border-primary-500 bg-primary-500",
            )}
          >
            {isConnecting ? (
              <Spinner color="rgb(41, 41, 41)" />
            ) : (
              <Text
                className={cn(
                  "font-bold text-lg",
                  canConnect ? "text-primary-800" : "text-primary-300",
                )}
              >
                {t(
                  isConnected && !sessionInvalid
                    ? `${KEY}.auth.reconnectAction`
                    : `${KEY}.auth.connectAction`,
                )}
              </Text>
            )}
          </FadeOutScaleDown>
          {isConnected && (
            <FadeOutScaleDown
              onPress={handleDisconnect}
              className="items-center justify-center py-3 px-8 border border-red-500 bg-red-500 rounded-full"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t(`${KEY}.auth.disconnectAction`)}
              </Text>
            </FadeOutScaleDown>
          )}
        </HStack>

        {isConnected && (
          <>
            <Box className="h-px bg-primary-500 my-2" />

            <FadeOutScaleDown href="/integrations/lastfm-stats">
              <HStack className="items-center gap-x-4 py-4">
                <VStack className="gap-y-1 flex-1">
                  <Heading className="text-white font-normal" size="md">
                    {t(`${KEY}.stats.entryLabel`)}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t(`${KEY}.stats.entryDescription`)}
                  </Text>
                </VStack>
                <ChevronRight size={20} color={primary50} />
              </HStack>
            </FadeOutScaleDown>

            <SettingsSectionTitle title={t(`${KEY}.scrobbling.title`)} />

            {serverIsScrobbling === true && (
              <SettingsNotice message={t(`${KEY}.scrobbling.serverWarning`)} />
            )}

            <SettingsToggleRow
              label={t(`${KEY}.scrobbling.enabledLabel`)}
              description={t(`${KEY}.scrobbling.enabledDescription`)}
              value={scrobblingEnabled}
              onToggle={setScrobblingEnabled}
            />

            <SettingsToggleRow
              label={t(`${KEY}.scrobbling.nowPlayingLabel`)}
              description={t(`${KEY}.scrobbling.nowPlayingDescription`)}
              value={submitNowPlaying}
              onToggle={setSubmitNowPlaying}
              disabled={!scrobblingEnabled}
            />

            <Box className="h-px bg-primary-500 my-2" />

            <SettingsSectionTitle title={t(`${KEY}.loves.title`)} />

            <SettingsToggleRow
              label={t(`${KEY}.loves.syncLabel`)}
              description={t(`${KEY}.loves.syncDescription`)}
              value={syncLoves}
              onToggle={setSyncLoves}
            />

            {lovedTracks.isLoading && <Spinner className="self-start" />}

            {lovedTracks.isError && (
              <Text className="text-primary-100 text-sm">
                {t(`${KEY}.loves.loadFailed`)}
              </Text>
            )}

            {lovedTracks.data && lovedTracks.data.total === 0 && (
              <Text className="text-primary-100 text-sm">
                {t(`${KEY}.loves.empty`)}
              </Text>
            )}

            {lovedTracks.data && lovedTracks.data.total > 0 && (
              <VStack className="gap-y-2">
                <Text className="text-primary-100 text-sm">
                  {t(`${KEY}.loves.totalCount`, {
                    count: lovedTracks.data.total,
                  })}
                </Text>
                <Text className="text-primary-100 text-xs uppercase">
                  {t(`${KEY}.loves.recentTitle`)}
                </Text>
                {lovedTracks.data.items.map((track, index) => (
                  <VStack
                    // Neither half is unique on its own, and an account can love
                    // two recordings of the same song, so position completes it.
                    key={`${track.artist}-${track.name}-${index}`}
                    className="gap-y-0.5"
                  >
                    <Text className="text-white text-sm" numberOfLines={1}>
                      {track.name}
                    </Text>
                    <Text
                      className="text-primary-100 text-xs"
                      numberOfLines={1}
                    >
                      {track.artist}
                    </Text>
                  </VStack>
                ))}
              </VStack>
            )}

            <SettingsActionRow
              label={t(`${KEY}.loves.importLabel`)}
              description={
                canImport
                  ? t(`${KEY}.loves.importDescription`)
                  : t(`${KEY}.loves.importOfflineDescription`)
              }
              actionLabel={t(
                importProgress
                  ? `${KEY}.loves.importingAction`
                  : `${KEY}.loves.importAction`,
              )}
              onPress={() => {
                void handleImportLoves();
              }}
              layout="wide"
              disabled={
                !canImport ||
                importProgress !== null ||
                lovedTracks.data?.total === 0
              }
            />

            {importProgress && (
              <Text className="text-primary-100 text-sm">
                {importProgressLabel()}
              </Text>
            )}

            {importResult && !importProgress && (
              <VStack className="gap-y-1">
                {importResult.starred > 0 && (
                  <Text className="text-primary-100 text-sm">
                    {t(`${KEY}.loves.importAdded`, {
                      count: importResult.starred,
                    })}
                  </Text>
                )}
                {importResult.fetched > importResult.matched && (
                  <Text className="text-primary-100 text-sm">
                    {t(`${KEY}.loves.importMissing`, {
                      count: importResult.fetched - importResult.matched,
                    })}
                  </Text>
                )}
                {importResult.failed > 0 && (
                  <Text className="text-amber-300 text-sm">
                    {t(`${KEY}.loves.importFailedCount`, {
                      count: importResult.failed,
                    })}
                  </Text>
                )}
                {importResult.truncated && (
                  <Text className="text-amber-300 text-sm">
                    {t(`${KEY}.loves.importTruncated`, {
                      count: MAX_IMPORTED_LOVES,
                    })}
                  </Text>
                )}
              </VStack>
            )}

            <Box className="h-px bg-primary-500 my-2" />

            <SettingsActionRow
              label={t(`${KEY}.queue.pendingLabel`)}
              description={
                queuedCount === 0
                  ? t(`${KEY}.queue.pendingDescriptionEmpty`)
                  : t(`${KEY}.queue.pendingDescription`, { count: queuedCount })
              }
              actionLabel={t(
                isSyncing
                  ? `${KEY}.queue.syncingAction`
                  : `${KEY}.queue.syncAction`,
              )}
              onPress={() => {
                void handleSyncNow();
              }}
              layout="wide"
              disabled={isSyncing || queuedCount === 0}
            />

            <FadeOutScaleDown
              onPress={() => {
                void Linking.openURL(LASTFM_SETTINGS_URL);
              }}
              className="self-start"
            >
              <Text className="text-emerald-400 text-sm underline">
                {t(`${KEY}.auth.manageAccessAction`)}
              </Text>
            </FadeOutScaleDown>
          </>
        )}

        {/* The wording is fixed by the Last.fm API terms of service (clause
            2.7), which mandates a "powered by AudioScrobbler" link. The hint
            below it exists because that name is Last.fm's old one and means
            nothing to a user reading it here. */}
        <VStack className="gap-y-1 mt-4">
          <FadeOutScaleDown
            onPress={() => {
              void Linking.openURL("https://www.last.fm/");
            }}
            className="self-start"
          >
            <Text className="text-primary-100 text-xs underline">
              {t(`${KEY}.attribution`)}
            </Text>
          </FadeOutScaleDown>
          <Text className="text-primary-200 text-xs">
            {t(`${KEY}.attributionHint`)}
          </Text>
        </VStack>
      </VStack>
    </SettingsScreenScaffold>
  );
}
