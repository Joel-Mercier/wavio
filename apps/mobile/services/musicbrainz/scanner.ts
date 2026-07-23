import { reportError } from "@/services/errorReporting";
import type { AlbumAggRow } from "@/services/local/repository";
import {
  queryAlbums,
  queryAlbumTracksByKey,
  queryTrackById,
} from "@/services/local/repository";
import {
  clearAlbumMatches,
  clearAllTrackOverrides,
  deleteAlbumMatch,
  queryAlbumMatches,
  upsertAlbumMatch,
  upsertTrackOverride,
} from "@/services/local/tagOverrides";
import {
  clearDownloadedCovers,
  fetchReleaseCover,
} from "@/services/musicbrainz/coverArt";
import {
  isFileWritingAvailable,
  writeTagsToFile,
} from "@/services/musicbrainz/fileWriter";
import {
  rankRecordings,
  rankReleases,
  scoreRelease,
} from "@/services/musicbrainz/match";
import {
  lookupRelease,
  searchRecording,
  searchRelease,
} from "@/services/musicbrainz/search";
import {
  type AlbumGrouping,
  buildRecordingProposal,
  buildTrackProposals,
  isNoOp,
  type TagField,
  type TrackProposal,
  wantsCoverArt,
} from "@/services/musicbrainz/tagging";
import type { LocalAlbumCandidate } from "@/services/musicbrainz/types";
import useMusicBrainz, { shouldAutoApply } from "@/stores/musicbrainz";
import { AbortedError } from "@/utils/rateLimitedQueue";

// Below this, the best search hit isn't worth spending a second request to look
// up its full tracklist — the album simply has no match on MusicBrainz.
const LOOKUP_FLOOR = 0.45;

// Per-track matching is inherently less certain than album matching (no
// tracklist to corroborate against), so it needs a higher bar before a match is
// offered at all.
const RECORDING_FLOOR = 0.6;

// Three distinct terminal phases, because "the scan stopped" is three different
// situations with three different remedies. "cancelled" and "failed" are both
// kept apart from "idle": the albums processed before the stop are matched and
// persisted, so dropping straight back to "idle" would hide real work, while
// "done" would claim the library was swept when most of it was never looked at.
export type MatchScanPhase =
  | "idle"
  | "matching"
  | "done"
  | "cancelled"
  | "failed";

export type MatchScanStatus = {
  phase: MatchScanPhase;
  processed: number;
  total: number;
  applied: number;
  pending: number;
  unmatched: number;
  currentAlbum?: string;
  error?: string;
};

const IDLE: MatchScanStatus = {
  phase: "idle",
  processed: 0,
  total: 0,
  applied: 0,
  pending: 0,
  unmatched: 0,
};

let status: MatchScanStatus = IDLE;
let controller: AbortController | null = null;
const listeners = new Set<(s: MatchScanStatus) => void>();

export function getMatchScanStatus(): MatchScanStatus {
  return status;
}

export function subscribeMatchScan(
  listener: (s: MatchScanStatus) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(patch: Partial<MatchScanStatus>): void {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
}

export function cancelMatchScan(): void {
  controller?.abort();
}

export function isMatchScanRunning(): boolean {
  return controller !== null;
}

// The file URI is only needed in "files" mode, and is read from the base track
// row rather than carried through the matcher (which is deliberately pure).
async function queryTrackUri(trackId: string): Promise<string | null> {
  const row = await queryTrackById(trackId);
  return row?.uri ?? null;
}

/** Assemble the album + its tracks into the shape the matcher compares against. */
export async function buildAlbumCandidate(
  album: AlbumAggRow,
): Promise<LocalAlbumCandidate> {
  const tracks = await queryAlbumTracksByKey(album.album_key);
  return {
    albumKey: album.album_key,
    album: album.name,
    albumArtist: album.album_artist ?? album.artist,
    year: album.year,
    tracks: tracks.map((t) => ({
      trackId: t.id,
      title: t.title,
      artist: t.artist,
      trackNumber: t.track_number,
      discNumber: t.disc_number,
      durationMs: t.duration_ms,
      artworkPath: t.artwork_path,
    })),
  };
}

/**
 * Why an album produced no match. Recorded per album and surfaced in the UI:
 * "no match" with no explanation is the single most confusing outcome of a scan,
 * and each of these has a different remedy.
 */
export type MatchFailure =
  // Nothing to search on. Album-level matching needs an album; loose untagged
  // files that never grouped into one cannot be matched this way at all.
  | "no-album-tag"
  // MusicBrainz returned zero releases for every query tier.
  | "no-results"
  // Found releases, but none resembled this album closely enough to be worth
  // trusting — usually a wrong-but-plausible title collision.
  | "low-confidence";

/**
 * A correction ready to review or apply, from either matching strategy.
 *
 * Everything downstream (review screen, apply, no-op check) only needs the
 * proposals, so both strategies converge here rather than leaking "release" vs
 * "recording" through the whole pipeline.
 */
export type MatchResult = {
  // "release": one MusicBrainz release matched the whole album.
  // "recordings": each track was matched individually, because the files never
  // grouped into an album to search on.
  source: "release" | "recordings";
  displayTitle: string;
  releaseId: string | null;
  confidence: number;
  proposals: TrackProposal[];
};

export type MatchOutcome =
  | { status: "matched"; result: MatchResult }
  | { status: "failed"; reason: MatchFailure; confidence?: number };

/**
 * Finds the best MusicBrainz release for one local album.
 *
 * Two requests at most, and the second is conditional: search ranks candidates
 * from metadata alone, and only a plausible leader earns the lookup that fetches
 * its tracklist. Re-scored afterwards, because the tracklist reveals per-track
 * title and duration agreement that the search result can't.
 */
export async function matchAlbum(
  local: LocalAlbumCandidate,
  fields: TagField[],
  signal?: AbortSignal,
): Promise<MatchOutcome> {
  // No album to search on. These are loose files that never grouped into an
  // album (a bare "Artist - Title.mp3" derives no album at all), so album-level
  // matching cannot see them — go straight to per-recording matching.
  if (!local.album) {
    return matchLooseTracks(local, fields, signal);
  }

  const results = await searchRelease(
    { album: local.album, artist: local.albumArtist },
    signal,
  );
  if (results.length === 0) {
    // The album name was probably a folder name rather than a real album (see
    // services/local/deriveTags.ts, which falls back to the containing folder),
    // so the tracks are worth trying individually.
    if (__DEV__) {
      console.log(
        `[musicbrainz] no release results for album=${JSON.stringify(local.album)} artist=${JSON.stringify(local.albumArtist)} - trying per-track`,
      );
    }
    return matchLooseTracks(local, fields, signal);
  }

  const ranked = rankReleases(local, results);
  const leader = ranked[0];
  if (__DEV__) {
    console.log(
      `[musicbrainz] ${JSON.stringify(local.album)} best candidates: ` +
        ranked
          .slice(0, 3)
          .map(
            (r) =>
              `${r.release.title}@${Math.round(r.confidence * 100)}%(${JSON.stringify(r.breakdown)})`,
          )
          .join(", "),
    );
  }
  if (!leader || leader.confidence < LOOKUP_FLOOR) {
    return {
      status: "failed",
      reason: "low-confidence",
      confidence: leader?.confidence,
    };
  }

  const full = await lookupRelease(leader.release.id, signal);
  // The lookup response carries no search score; keep the search's so the
  // re-score stays comparable with the threshold.
  const match = scoreRelease(local, { ...full, score: leader.release.score });
  return {
    status: "matched",
    result: {
      source: "release",
      displayTitle: match.release.title,
      releaseId: match.release.id,
      confidence: match.confidence,
      proposals: buildTrackProposals(local, match, fields),
    },
  };
}

/**
 * Matches each track on its own, for files that never formed a real album.
 *
 * Costs one request per track rather than one per album, so it only runs when
 * album-level matching had nothing to work with. Tracks are matched
 * independently, which means a folder of unrelated singles resolves correctly
 * instead of being forced onto one release.
 */
export async function matchLooseTracks(
  local: LocalAlbumCandidate,
  fields: TagField[],
  signal?: AbortSignal,
): Promise<MatchOutcome> {
  const proposals: TrackProposal[] = [];
  const confidences: number[] = [];

  // Set only when these tracks really are an album — this path is also the
  // fallback for an album MusicBrainz didn't return, and each track then
  // resolves to its own release. Passing the grouping down keeps those
  // independent attributions from re-filing the album a track at a time.
  const grouping: AlbumGrouping | null = local.album
    ? {
        album: local.album,
        albumArtist: local.albumArtist,
        albumKey: local.albumKey,
      }
    : null;

  for (const track of local.tracks) {
    if (signal?.aborted) break;
    if (!track.title) continue;

    const recordings = await searchRecording(
      { title: track.title, artist: track.artist },
      signal,
    );
    if (recordings.length === 0) continue;

    const best = rankRecordings(track, recordings)[0];
    if (__DEV__) {
      console.log(
        `[musicbrainz] track ${JSON.stringify(track.title)} -> ` +
          `${best?.recording.title}@${Math.round((best?.confidence ?? 0) * 100)}% ` +
          `(${JSON.stringify(best?.breakdown)}) release=${best?.release?.title}`,
      );
    }
    if (!best || best.confidence < RECORDING_FLOOR) continue;

    proposals.push(buildRecordingProposal(track, best, fields, grouping));
    confidences.push(best.confidence);
  }

  if (proposals.length === 0) {
    return { status: "failed", reason: "no-results" };
  }

  const confidence =
    confidences.reduce((sum, c) => sum + c, 0) / confidences.length;

  return {
    status: "matched",
    result: {
      source: "recordings",
      // The attributed album if there is one; otherwise the corrected track
      // title, so the review screen never shows an empty heading for a loose
      // track that got no album.
      displayTitle:
        proposals[0].override.album ??
        local.album ??
        proposals[0].override.title ??
        proposals[0].local.title ??
        "",
      releaseId: null,
      confidence,
      proposals,
    },
  };
}

/**
 * Persist a match's corrections. Returns how many tracks were changed.
 *
 * In "files" mode the correction is written into the file *and* recorded as an
 * override: the override keeps the UI correct straight away rather than waiting
 * for a rescan to read the new tags back, and `written_to_file` records which of
 * the two actually happened. A failed file write degrades to override-only
 * instead of losing the match.
 */
export async function applyMatch(
  local: LocalAlbumCandidate,
  result: MatchResult,
  fields: TagField[],
): Promise<number> {
  const proposals = result.proposals;
  const toFiles =
    useMusicBrainz.getState().tagWriteMode === "files" &&
    isFileWritingAvailable();

  // At most one cover fetch per release for the whole apply, *including* one
  // that came back empty. Most releases have no cover in the archive, and every
  // track of an album carries the same release id — without remembering the
  // empty answer, a 12-track album asks the archive for the same missing image
  // twelve times.
  //
  // Deliberately scoped to this call rather than kept in a module-level cache:
  // the archive gains covers over time, so a later apply should ask again.
  const covers = new Map<string, string | null>();
  const coverFor = async (releaseId: string | null) => {
    if (!releaseId) return null;
    const seen = covers.get(releaseId);
    if (seen !== undefined) return seen;
    const path = await fetchReleaseCover(releaseId);
    covers.set(releaseId, path);
    return path;
  };

  for (const proposal of proposals) {
    // A release match puts every track on one release; a per-recording match
    // leaves `result.releaseId` null and attributes each track to its own. One
    // expression covers both, so the two paths no longer need separate handling.
    const artworkPath = wantsCoverArt(proposal.local, fields)
      ? await coverFor(result.releaseId ?? proposal.override.mb_release_id)
      : null;
    const override = { ...proposal.override, artwork_path: artworkPath };
    let writtenToFile = false;
    if (toFiles) {
      const uri = await queryTrackUri(override.track_id);
      if (uri) {
        writtenToFile = await writeTagsToFile(uri, override);
      }
    }
    await upsertTrackOverride({ ...override, writtenToFile });
  }
  // Correcting an album's title or album-artist moves it to a new grouping key,
  // so the match row has to move with it: left under the old key it resolves to
  // no album at all, and the next scan sees a library album with no match row
  // and matches it again — re-spending the rate budget on work already done.
  // Only a release match moves an album as one; per-recording matches leave the
  // grouping alone, so their row stays where the scan found it.
  const appliedKey =
    result.source === "release"
      ? (proposals[0]?.override.album_key ?? local.albumKey)
      : local.albumKey;
  if (appliedKey !== local.albumKey) {
    await deleteAlbumMatch(local.albumKey);
  }
  await upsertAlbumMatch({
    album_key: appliedKey,
    mb_release_id: result.releaseId,
    confidence: result.confidence,
    status: "applied",
    candidates_json: null,
    reason: null,
  });
  return proposals.length;
}

export type PendingReview = {
  albumKey: string;
  name: string | null;
  artist: string | null;
  confidence: number;
};

export type UnmatchedAlbum = {
  albumKey: string;
  name: string | null;
  artist: string | null;
  reason: MatchFailure;
};

/** Albums the last scan couldn't match, each with the reason it failed. */
export async function loadUnmatchedAlbums(): Promise<UnmatchedAlbum[]> {
  const rows = await queryAlbumMatches("unmatched");
  if (rows.length === 0) return [];
  const albums = await queryAlbums({});
  const byKey = new Map(albums.map((a) => [a.album_key, a]));
  return rows.flatMap((row) => {
    const album = byKey.get(row.album_key);
    if (!album) return [];
    return [
      {
        albumKey: row.album_key,
        name: album.name,
        artist: album.album_artist ?? album.artist,
        reason: (row.reason as MatchFailure) ?? "no-results",
      },
    ];
  });
}

/**
 * The review queue, resolved against the library so each entry can be shown by
 * name. A queued album whose files have since been removed is dropped rather
 * than rendered as a bare grouping key.
 */
export async function loadPendingReviews(): Promise<PendingReview[]> {
  const matches = await queryAlbumMatches("pending");
  if (matches.length === 0) return [];
  const albums = await queryAlbums({});
  const byKey = new Map(albums.map((a) => [a.album_key, a]));
  return matches.flatMap((match) => {
    const album = byKey.get(match.album_key);
    if (!album) return [];
    return [
      {
        albumKey: match.album_key,
        name: album.name,
        artist: album.album_artist ?? album.artist,
        confidence: match.confidence ?? 0,
      },
    ];
  });
}

/**
 * Drops every correction and empties the review queue, returning the library to
 * exactly what the indexer read from the files.
 *
 * Only undoes the *override* layer. Corrections already written into files are
 * part of the files now — which is why file mode never auto-applies.
 */
export async function resetAllCorrections(): Promise<void> {
  await clearAllTrackOverrides();
  await clearAlbumMatches();
  clearDownloadedCovers();
  useMusicBrainz.getState().setLastScanAt(null);
}

/**
 * Walks the whole local library, matching each album.
 *
 * Runs in the background and streams progress to subscribers, mirroring the
 * indexer's scan (services/local/mediaLibraryScanning.ts). Every MusicBrainz
 * call is rate-limited to one per second, so a large library takes minutes —
 * cancellation is checked between albums and inside the request queue.
 */
export async function startMatchScan(): Promise<void> {
  if (controller) return;
  controller = new AbortController();
  const { signal } = controller;
  const fields = useMusicBrainz.getState().fieldsToWrite;

  status = { ...IDLE, phase: "matching" };
  emit({});

  // Set only when the loop leaves albums unprocessed. Deliberately not derived
  // from `signal.aborted` afterwards: cancelling as the final album finishes
  // would then discard a scan that did in fact cover the whole library.
  let cancelled = false;

  try {
    const albums = await queryAlbums({});
    emit({ total: albums.length });

    for (const album of albums) {
      if (signal.aborted) {
        cancelled = true;
        break;
      }
      emit({ currentAlbum: album.name ?? undefined });

      try {
        const local = await buildAlbumCandidate(album);
        const outcome = await matchAlbum(local, fields, signal);

        if (outcome.status === "failed") {
          await upsertAlbumMatch({
            album_key: local.albumKey,
            mb_release_id: null,
            confidence: outcome.confidence ?? null,
            status: "unmatched",
            candidates_json: null,
            reason: outcome.reason,
          });
          if (__DEV__) {
            console.log(
              `[musicbrainz] ${JSON.stringify(album.name)} -> no match (${outcome.reason})`,
            );
          }
          emit({ unmatched: status.unmatched + 1 });
          emit({ processed: status.processed + 1 });
          continue;
        }

        const result = outcome.result;
        if (__DEV__) {
          console.log(
            `[musicbrainz] ${JSON.stringify(album.name)} -> ${result.source} ` +
              `${JSON.stringify(result.displayTitle)} @${Math.round(result.confidence * 100)}% ` +
              `(${result.proposals.length} tracks)`,
          );
        }
        if (isNoOp(result.proposals)) {
          // Already correct — record it so the review queue doesn't offer a
          // change that would do nothing.
          await upsertAlbumMatch({
            album_key: local.albumKey,
            mb_release_id: result.releaseId,
            confidence: result.confidence,
            status: "applied",
            candidates_json: null,
            reason: null,
          });
        } else if (shouldAutoApply(result.confidence)) {
          await applyMatch(local, result, fields);
          emit({ applied: status.applied + 1 });
        } else {
          await upsertAlbumMatch({
            album_key: local.albumKey,
            mb_release_id: result.releaseId,
            confidence: result.confidence,
            status: "pending",
            candidates_json: null,
            reason: null,
          });
          emit({ pending: status.pending + 1 });
        }
      } catch (error) {
        if (error instanceof AbortedError) {
          cancelled = true;
          break;
        }
        // One album's failure must not end the scan — a single unparseable
        // release shouldn't cost the user the whole run.
        reportError(error, {
          area: "metadata",
          api: "musicbrainz",
          endpoint: "matchAlbum",
          extra: { albumKey: album.album_key },
        });
        emit({ unmatched: status.unmatched + 1 });
      }

      emit({ processed: status.processed + 1 });
    }

    if (cancelled) {
      // No lastScanAt: it means "the library has been swept", which is what the
      // Integrations badge and any future incremental re-scan key off. A run
      // that stopped after 3 of 900 albums has not swept anything.
      emit({ phase: "cancelled", currentAlbum: undefined });
    } else {
      useMusicBrainz.getState().setLastScanAt(Date.now());
      emit({ phase: "done", currentAlbum: undefined });
    }
  } catch (error) {
    reportError(error, {
      area: "metadata",
      api: "musicbrainz",
      endpoint: "startMatchScan",
    });
    // Only reached when the scan itself broke — a single album's failure is
    // caught inside the loop and costs that album, not the run. No lastScanAt
    // for the same reason as a cancellation: the library wasn't swept.
    emit({ phase: "failed", currentAlbum: undefined, error: String(error) });
  } finally {
    controller = null;
  }
}
