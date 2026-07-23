import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { SettingsSectionTitle } from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { reportError } from "@/services/errorReporting";
import { parseLocalAlbumId } from "@/services/local/keys";
import { queryAlbumByKey } from "@/services/local/repository";
import { setAlbumMatchStatus } from "@/services/local/tagOverrides";
import {
  applyMatch,
  buildAlbumCandidate,
  type MatchResult,
  matchAlbum,
} from "@/services/musicbrainz/scanner";
import type { LocalAlbumCandidate } from "@/services/musicbrainz/types";
import useMusicBrainz from "@/stores/musicbrainz";
import { AbortedError } from "@/utils/rateLimitedQueue";

export default function AlbumMatchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  // The route carries the hex-encoded album id (see services/local/keys.ts),
  // which survives expo-router's decodeURIComponent pass intact — a raw album
  // key would not, since keys contain spaces and can contain "/".
  const { albumKey: albumId } = useLocalSearchParams<{ albumKey?: string }>();
  const albumKey = albumId
    ? (parseLocalAlbumId(albumId) ?? undefined)
    : undefined;

  const fieldsToWrite = useMusicBrainz((s) => s.fieldsToWrite);
  const tagWriteMode = useMusicBrainz((s) => s.tagWriteMode);

  const [local, setLocal] = useState<LocalAlbumCandidate | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!albumKey) return;
    let cancelled = false;
    // Matching an album costs one request, and an album MusicBrainz doesn't know
    // falls back to one per track — all of it against a budget of one request a
    // second. Leaving the screen has to actually stop that, not just ignore what
    // comes back.
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const album = await queryAlbumByKey(albumKey);
        if (!album || cancelled) return;
        const candidate = await buildAlbumCandidate(album);
        // Re-matched on open rather than replayed from the stored candidate:
        // the tracklist is what the diff is built from, and re-fetching keeps
        // the review honest if the library changed since the scan.
        const outcome = await matchAlbum(
          candidate,
          fieldsToWrite,
          controller.signal,
        );
        if (cancelled) return;
        setLocal(candidate);
        setResult(outcome.status === "matched" ? outcome.result : null);
      } catch (error) {
        // An abort is the expected way this ends when the user navigates away,
        // so it is not a fault. Anything else leaves the screen on its "no
        // match" state, which is the honest thing to show when the lookup died.
        if (cancelled || error instanceof AbortedError) return;
        reportError(error, {
          area: "metadata",
          api: "musicbrainz",
          endpoint: "reviewAlbum",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [albumKey, fieldsToWrite]);

  const onApply = useCallback(() => {
    if (!local || !result) return;
    setApplying(true);
    void (async () => {
      try {
        await applyMatch(local, result, fieldsToWrite);
        router.back();
      } finally {
        setApplying(false);
      }
    })();
  }, [local, result, fieldsToWrite, router]);

  const onDismiss = useCallback(() => {
    if (!albumKey) return;
    void setAlbumMatchStatus(albumKey, "dismissed").then(() => {
      router.back();
    });
  }, [albumKey, router]);

  const title =
    local?.album ?? t("app.settings.integrations.musicbrainz.title");

  if (loading) {
    return (
      <SettingsScreenScaffold title={title}>
        <Box className="py-12 items-center">
          <Spinner color={emerald500} />
        </Box>
      </SettingsScreenScaffold>
    );
  }

  if (!result || !local) {
    return (
      <SettingsScreenScaffold title={title}>
        <Text className="text-primary-100 text-sm py-4">
          {t("app.settings.integrations.musicbrainz.album.noMatch")}
        </Text>
      </SettingsScreenScaffold>
    );
  }

  return (
    <SettingsScreenScaffold title={title}>
      <VStack className="gap-y-2">
        <VStack className="gap-y-1 py-2">
          <Heading className="text-white font-normal" size="md">
            {result.displayTitle}
          </Heading>
          <Text className="text-primary-100 text-sm">
            {t(
              result.source === "recordings"
                ? "app.settings.integrations.musicbrainz.album.summaryTracks"
                : "app.settings.integrations.musicbrainz.album.summary",
              {
                confidence: Math.round(result.confidence * 100),
                tracks: result.proposals.length,
              },
            )}
          </Text>
        </VStack>

        <SettingsSectionTitle
          title={t("app.settings.integrations.musicbrainz.album.changes")}
        />

        {result.proposals.every((p) => p.diffs.length === 0) ? (
          <Text className="text-primary-100 text-sm py-2">
            {t("app.settings.integrations.musicbrainz.album.noChanges")}
          </Text>
        ) : (
          result.proposals
            .filter((p) => p.diffs.length > 0)
            .map((proposal) => (
              <VStack key={proposal.local.trackId} className="gap-y-1 py-3">
                <Heading
                  className="text-white font-normal"
                  size="sm"
                  numberOfLines={1}
                >
                  {proposal.local.title ?? proposal.mbTrack?.title}
                </Heading>
                {proposal.diffs.map((diff) => (
                  <HStack
                    key={diff.field}
                    className="items-center gap-x-2 flex-wrap"
                  >
                    <Text className="text-primary-100 text-xs w-24">
                      {t(
                        `app.settings.integrations.musicbrainz.fields.labels.${diff.field}`,
                      )}
                    </Text>
                    <Text className="text-red-300 text-xs line-through flex-shrink">
                      {String(diff.current ?? "—")}
                    </Text>
                    <Text className="text-emerald-300 text-xs flex-shrink">
                      {String(diff.proposed ?? "—")}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            ))
        )}

        <HStack className="gap-x-4 py-6">
          <FadeOutScaleDown
            onPress={onDismiss}
            disabled={applying}
            className="flex-1 items-center justify-center py-3 border border-primary-500 rounded-full"
          >
            <Text className="text-white font-bold text-lg">
              {t("app.settings.integrations.musicbrainz.album.dismiss")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            onPress={onApply}
            disabled={applying}
            disabledOpacity={0.5}
            className="flex-1 items-center justify-center py-3 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            {/* Writing tags rewrites each file in turn and downloads cover art,
                so this is seconds of work on an album — without feedback the
                button reads as unresponsive and invites a second tap. */}
            {applying ? (
              <HStack className="items-center gap-x-2">
                <Spinner size="small" color={emerald500} />
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.settings.integrations.musicbrainz.album.applying")}
                </Text>
              </HStack>
            ) : (
              <Text className="text-primary-800 font-bold text-lg">
                {tagWriteMode === "files"
                  ? t(
                      "app.settings.integrations.musicbrainz.album.applyToFiles",
                    )
                  : t("app.settings.integrations.musicbrainz.album.apply")}
              </Text>
            )}
          </FadeOutScaleDown>
        </HStack>
      </VStack>
    </SettingsScreenScaffold>
  );
}
