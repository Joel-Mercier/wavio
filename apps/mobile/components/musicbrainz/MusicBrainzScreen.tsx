import { useFocusEffect, useRouter } from "expo-router";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  SettingsActionRow,
  SettingsSectionTitle,
  SettingsStepperRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Progress, ProgressFilledTrack } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { localAlbumId } from "@/services/local/keys";
import { isFileWritingAvailable } from "@/services/musicbrainz/fileWriter";
import {
  cancelMatchScan,
  getMatchScanStatus,
  loadPendingReviews,
  loadUnmatchedAlbums,
  type MatchScanPhase,
  type MatchScanStatus,
  type PendingReview,
  resetAllCorrections,
  startMatchScan,
  subscribeMatchScan,
  type UnmatchedAlbum,
} from "@/services/musicbrainz/scanner";
import { ALL_TAG_FIELDS } from "@/services/musicbrainz/tagging";
import useMusicBrainz from "@/stores/musicbrainz";
import { cn } from "@/utils/tailwind";

// Which closing line each terminal phase gets. Absent phases ("idle" before the
// first run, "matching" while it's live) show none.
const SUMMARY_KEY: Partial<Record<MatchScanPhase, string>> = {
  done: "summary",
  cancelled: "cancelledSummary",
  failed: "failedSummary",
};

const THRESHOLD_STEP = 0.05;
const MIN_THRESHOLD = 0.6;
const MAX_THRESHOLD = 1;

export default function MusicBrainzScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];

  const tagWriteMode = useMusicBrainz((s) => s.tagWriteMode);
  const autoApplyEnabled = useMusicBrainz((s) => s.autoApplyEnabled);
  const autoApplyThreshold = useMusicBrainz((s) => s.autoApplyThreshold);
  const fieldsToWrite = useMusicBrainz((s) => s.fieldsToWrite);
  const setTagWriteMode = useMusicBrainz((s) => s.setTagWriteMode);
  const setAutoApplyEnabled = useMusicBrainz((s) => s.setAutoApplyEnabled);
  const setAutoApplyThreshold = useMusicBrainz((s) => s.setAutoApplyThreshold);
  const toggleField = useMusicBrainz((s) => s.toggleField);

  const [status, setStatus] = useState<MatchScanStatus>(getMatchScanStatus);
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedAlbum[]>([]);

  const canWriteFiles = isFileWritingAvailable();
  const isScanning = status.phase === "matching";

  useEffect(() => subscribeMatchScan(setStatus), []);

  const refreshPending = useCallback(() => {
    void loadPendingReviews().then(setPending);
    void loadUnmatchedAlbums().then(setUnmatched);
  }, []);

  // Reload the queue whenever a scan settles, so newly-queued albums appear
  // without the user having to leave and come back.
  useEffect(() => {
    if (!isScanning) refreshPending();
  }, [isScanning, refreshPending]);

  // …and again on every focus, so an album applied or dismissed on the detail
  // screen leaves the queue when the user comes back to it.
  useFocusEffect(refreshPending);

  const progress =
    status.total > 0 ? (status.processed / status.total) * 100 : 0;

  return (
    <SettingsScreenScaffold
      title={t("app.settings.integrations.musicbrainz.title")}
    >
      <VStack className="gap-y-2">
        <Text className="text-primary-100 text-sm py-2">
          {t("app.settings.integrations.musicbrainz.intro")}
        </Text>

        <SettingsSectionTitle
          title={t("app.settings.integrations.musicbrainz.writeMode.title")}
        />
        <SettingsToggleRow
          label={t("app.settings.integrations.musicbrainz.writeMode.label")}
          description={
            canWriteFiles
              ? t("app.settings.integrations.musicbrainz.writeMode.description")
              : t("app.settings.integrations.musicbrainz.writeMode.unavailable")
          }
          value={tagWriteMode === "files"}
          disabled={!canWriteFiles}
          onToggle={(value) => {
            setTagWriteMode(value ? "files" : "override");
          }}
        />

        <SettingsSectionTitle
          title={t("app.settings.integrations.musicbrainz.automation.title")}
        />
        <SettingsToggleRow
          label={t("app.settings.integrations.musicbrainz.autoApply.label")}
          description={
            tagWriteMode === "files"
              ? t(
                  "app.settings.integrations.musicbrainz.autoApply.filesDescription",
                )
              : t("app.settings.integrations.musicbrainz.autoApply.description")
          }
          value={autoApplyEnabled && tagWriteMode !== "files"}
          disabled={tagWriteMode === "files"}
          onToggle={setAutoApplyEnabled}
        />
        <SettingsStepperRow
          // Disabled whenever auto-apply is: the threshold only governs
          // auto-apply, so leaving it live while the toggle above is off reads
          // as though it still does something.
          disabled={tagWriteMode === "files" || !autoApplyEnabled}
          label={t("app.settings.integrations.musicbrainz.threshold.label")}
          description={t(
            "app.settings.integrations.musicbrainz.threshold.description",
          )}
          valueText={`${Math.round(autoApplyThreshold * 100)}%`}
          onDecrement={() => {
            setAutoApplyThreshold(
              Math.max(MIN_THRESHOLD, autoApplyThreshold - THRESHOLD_STEP),
            );
          }}
          onIncrement={() => {
            setAutoApplyThreshold(
              Math.min(MAX_THRESHOLD, autoApplyThreshold + THRESHOLD_STEP),
            );
          }}
        />

        <SettingsSectionTitle
          title={t("app.settings.integrations.musicbrainz.fields.title")}
        />
        <Text className="text-primary-100 text-sm pb-2">
          {t("app.settings.integrations.musicbrainz.fields.description")}
        </Text>
        <HStack className="flex-wrap gap-2 pb-2">
          {ALL_TAG_FIELDS.map((field) => {
            const selected = fieldsToWrite.includes(field);
            return (
              <FadeOutScaleDown
                key={field}
                onPress={() => {
                  toggleField(field);
                }}
              >
                <Badge
                  className={cn(
                    "rounded-full normal-case py-1 px-3",
                    selected ? "bg-emerald-100" : "bg-primary-600",
                  )}
                  size="lg"
                  variant="solid"
                  action={selected ? "success" : "muted"}
                >
                  <BadgeText
                    className={cn(
                      "normal-case text-center",
                      selected ? "text-emerald-700" : "text-primary-100",
                    )}
                  >
                    {t(
                      `app.settings.integrations.musicbrainz.fields.labels.${field}`,
                    )}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
            );
          })}
        </HStack>

        <SettingsSectionTitle
          title={t("app.settings.integrations.musicbrainz.scan.title")}
        />
        <SettingsActionRow
          layout="wide"
          label={t("app.settings.integrations.musicbrainz.scan.label")}
          description={t(
            "app.settings.integrations.musicbrainz.scan.description",
          )}
          actionLabel={
            isScanning
              ? t("app.settings.integrations.musicbrainz.scan.cancel")
              : t("app.settings.integrations.musicbrainz.scan.start")
          }
          variant={isScanning ? "danger" : "primary"}
          onPress={() => {
            if (isScanning) {
              cancelMatchScan();
            } else {
              void startMatchScan();
            }
          }}
        />

        {isScanning && (
          <VStack className="gap-y-2 py-2">
            {/* Explicit colours: the component's default track and fill are
                both `bg-primary`, which on this app's dark surface renders
                near-black on near-black — an invisible progress bar. */}
            <Progress value={progress} className="bg-primary-600">
              <ProgressFilledTrack className="bg-emerald-500" />
            </Progress>
            <Text className="text-primary-100 text-sm" numberOfLines={1}>
              {t("app.settings.integrations.musicbrainz.scan.progress", {
                processed: status.processed,
                total: status.total,
                album: status.currentAlbum ?? "",
              })}
            </Text>
          </VStack>
        )}

        {SUMMARY_KEY[status.phase] && (
          <VStack className="gap-y-1 py-2">
            <Text
              className={cn(
                "text-sm",
                status.phase === "failed" ? "text-red-300" : "text-primary-100",
              )}
            >
              {t(
                `app.settings.integrations.musicbrainz.scan.${SUMMARY_KEY[status.phase]}`,
                {
                  applied: status.applied,
                  pending: status.pending,
                  unmatched: status.unmatched,
                  processed: status.processed,
                  total: status.total,
                },
              )}
            </Text>
            {/* The raw message, kept out of the translated sentence: it's the
                only clue as to *why* a scan died, and it isn't translatable. */}
            {status.phase === "failed" && status.error && (
              <Text className="text-primary-100 text-xs" numberOfLines={3}>
                {status.error}
              </Text>
            )}
          </VStack>
        )}

        <SettingsActionRow
          layout="wide"
          variant="danger"
          label={t("app.settings.integrations.musicbrainz.reset.label")}
          description={t(
            "app.settings.integrations.musicbrainz.reset.description",
          )}
          actionLabel={t("app.settings.integrations.musicbrainz.reset.action")}
          disabled={isScanning}
          onPress={() => {
            void resetAllCorrections().then(refreshPending);
          }}
        />

        {pending.length > 0 && (
          <>
            <SettingsSectionTitle
              title={t("app.settings.integrations.musicbrainz.review.title", {
                count: pending.length,
              })}
            />
            {pending.map((match) => (
              <FadeOutScaleDown
                key={match.albumKey}
                onPress={() => {
                  // Hex-encoded album id, not the raw key: keys contain spaces
                  // and can contain "/", and expo-router runs every param
                  // through decodeURIComponent. See services/local/keys.ts.
                  router.push(
                    `/integrations/musicbrainz-album/${localAlbumId(
                      match.albumKey,
                    )}`,
                  );
                }}
              >
                <HStack className="items-center gap-x-4 py-4">
                  <VStack className="gap-y-1 flex-1">
                    <Heading
                      className="text-white font-normal"
                      size="md"
                      numberOfLines={1}
                    >
                      {match.name ?? match.albumKey}
                    </Heading>
                    <Text
                      className="text-primary-100 text-sm"
                      numberOfLines={1}
                    >
                      {[
                        match.artist,
                        t(
                          "app.settings.integrations.musicbrainz.review.confidence",
                          { confidence: Math.round(match.confidence * 100) },
                        ),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </VStack>
                  <Box className="w-5 items-center">
                    <ChevronRight size={20} color={gray200} />
                  </Box>
                </HStack>
              </FadeOutScaleDown>
            ))}
          </>
        )}

        {unmatched.length > 0 && (
          <>
            <SettingsSectionTitle
              title={t(
                "app.settings.integrations.musicbrainz.unmatched.title",
                {
                  count: unmatched.length,
                },
              )}
            />
            <Text className="text-primary-100 text-sm pb-2">
              {t("app.settings.integrations.musicbrainz.unmatched.description")}
            </Text>
            {unmatched.map((album) => (
              <VStack key={album.albumKey} className="gap-y-1 py-3">
                <Heading
                  className="text-white font-normal"
                  size="sm"
                  numberOfLines={1}
                >
                  {album.name ?? album.albumKey}
                </Heading>
                <Text className="text-primary-100 text-xs" numberOfLines={2}>
                  {[
                    album.artist,
                    t(
                      `app.settings.integrations.musicbrainz.unmatched.reasons.${album.reason}`,
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </VStack>
            ))}
          </>
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
