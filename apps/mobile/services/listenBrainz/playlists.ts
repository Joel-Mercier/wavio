import listenBrainzApiInstance from "@/services/listenBrainz";
import { caaThumbUrl } from "@/services/listenBrainz/statsMappers";
import {
  type CreatedForPatch,
  type CreatedForResponse,
  JSPF_PLAYLIST_EXT,
  JSPF_TRACK_EXT,
  type JspfPlaylist,
  type JspfTrack,
  type ListenBrainzPlaylistSummary,
  type ListenBrainzPlaylistTrack,
  type PlaylistResponse,
} from "@/services/listenBrainz/types";
import { requireUserName } from "@/services/listenBrainz/user";

/**
 * The generated playlists the app surfaces, in the order they are displayed.
 *
 * The API returns createdfor playlists newest-first and mixed together with the
 * yearly sets, so ordering by that would shuffle the three cards around from one
 * day to the next depending on which generator last ran. A fixed order keeps the
 * carousel where the user left it.
 */
export const CREATED_FOR_PATCHES = [
  "daily-jams",
  "weekly-jams",
  "weekly-exploration",
] as const;

const CREATED_FOR_PATCH_SET = new Set<string>(CREATED_FOR_PATCHES);

// One page is enough: the three recurring playlists are regenerated daily or
// weekly, so they are always at the head of a newest-first list, well ahead of
// the yearly top-discoveries/top-missed sets that make up the long tail.
const CREATED_FOR_PAGE_SIZE = 25;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLAYLIST_MBID_RE = new RegExp(`/playlist/(${UUID})`, "i");
const RECORDING_MBID_RE = new RegExp(`/recording/(${UUID})`, "i");
const ARTIST_MBID_RE = new RegExp(`/artist/(${UUID})`, "i");

/**
 * Pulls an MBID out of a JSPF `identifier`, whichever shape it arrived in.
 *
 * Current ListenBrainz emits an array of URIs; older releases (and some
 * self-hosted instances) emit a bare string. Both are accepted rather than
 * pinned to the current one, because getting this wrong looks like an empty
 * playlist rather than an error.
 */
function mbidFromIdentifier(
  identifier: string | string[] | undefined,
  pattern: RegExp,
): string | null {
  const candidates =
    typeof identifier === "string"
      ? [identifier]
      : Array.isArray(identifier)
        ? identifier
        : [];
  for (const candidate of candidates) {
    const match = typeof candidate === "string" && candidate.match(pattern);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

export function playlistMbidFromIdentifier(
  identifier: string | string[] | undefined,
): string | null {
  return mbidFromIdentifier(identifier, PLAYLIST_MBID_RE);
}

function playlistExtension(playlist: JspfPlaylist) {
  return playlist.extension?.[JSPF_PLAYLIST_EXT];
}

function sourcePatch(playlist: JspfPlaylist): CreatedForPatch | null {
  const patch =
    playlistExtension(playlist)?.additional_metadata?.algorithm_metadata
      ?.source_patch;
  return patch && CREATED_FOR_PATCH_SET.has(patch)
    ? (patch as CreatedForPatch)
    : null;
}

/**
 * Normalises one JSPF track.
 *
 * Returns null for a row with no title or no artist: it can neither be matched
 * against the library nor handed to a downloader, so rendering it would only
 * offer a dead end.
 */
export function toPlaylistTrack(
  track: JspfTrack,
  index: number,
): ListenBrainzPlaylistTrack | null {
  const title = track.title?.trim();
  if (!title) return null;

  const extension = track.extension?.[JSPF_TRACK_EXT];
  const credits = extension?.additional_metadata?.artists ?? [];

  // The split credits reproduce MusicBrainz's own join phrases ("A feat. B"),
  // which `creator` already flattens — but only the split form tells us which
  // name is the lead, and that is what a library is usually tagged with.
  const joined = credits
    .map(
      (credit) =>
        `${credit.artist_credit_name ?? ""}${credit.join_phrase ?? ""}`,
    )
    .join("")
    .trim();
  const artist = joined || track.creator?.trim() || "";
  if (!artist) return null;
  const primaryArtist =
    credits[0]?.artist_credit_name?.trim() || track.creator?.trim() || artist;

  const recordingMbid =
    mbidFromIdentifier(track.identifier, RECORDING_MBID_RE) ?? undefined;

  const artistMbids = [
    ...new Set(
      [
        ...credits.map((credit) => credit.artist_mbid),
        ...(extension?.artist_identifiers ?? []).map((uri) =>
          mbidFromIdentifier(uri, ARTIST_MBID_RE),
        ),
      ].filter((mbid): mbid is string => !!mbid),
    ),
  ];

  return {
    key: recordingMbid ?? `${index}:${title}:${artist}`,
    title,
    artist,
    primaryArtist,
    album: track.album?.trim() || undefined,
    // JSPF durations are already milliseconds.
    durationMs:
      typeof track.duration === "number" && track.duration > 0
        ? track.duration
        : undefined,
    recordingMbid,
    artistMbids,
    coverArtUrl: caaThumbUrl(
      extension?.additional_metadata?.caa_id,
      extension?.additional_metadata?.caa_release_mbid,
    ),
  };
}

/**
 * The newest Daily Jams / Weekly Jams / Weekly Exploration built for the user.
 *
 * These are public, so the request works even before the token is validated —
 * but the *name* still has to come from somewhere, hence requireUserName. An
 * account with no listening history simply has none of them, which is a normal
 * state, not an error: the caller gets an empty array and hides the section.
 */
export async function fetchCreatedForPlaylists({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<ListenBrainzPlaylistSummary[]> {
  const userName = requireUserName();

  const response = await listenBrainzApiInstance.get<CreatedForResponse>(
    `/1/user/${userName}/playlists/createdfor`,
    { params: { count: CREATED_FOR_PAGE_SIZE, offset: 0 }, signal },
  );

  // Newest-first, so the first hit for a patch is that patch's current playlist.
  const newest = new Map<CreatedForPatch, ListenBrainzPlaylistSummary>();
  for (const entry of response.data?.playlists ?? []) {
    const playlist = entry?.playlist;
    if (!playlist) continue;
    const patch = sourcePatch(playlist);
    if (!patch || newest.has(patch)) continue;
    const mbid = playlistMbidFromIdentifier(playlist.identifier);
    if (!mbid) continue;
    newest.set(patch, {
      mbid,
      patch,
      createdAt: playlist.date ?? null,
      expiresAt:
        playlistExtension(playlist)?.additional_metadata?.expires_at ?? null,
    });
  }

  return CREATED_FOR_PATCHES.map((patch) => newest.get(patch)).filter(
    (summary): summary is ListenBrainzPlaylistSummary => !!summary,
  );
}

/** The tracks of one playlist. Unnamed rows are dropped, not rendered blank. */
export async function fetchPlaylist(
  mbid: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<ListenBrainzPlaylistTrack[]> {
  const response = await listenBrainzApiInstance.get<PlaylistResponse>(
    `/1/playlist/${encodeURIComponent(mbid)}`,
    { signal },
  );
  return (response.data?.playlist?.track ?? [])
    .map(toPlaylistTrack)
    .filter((track): track is ListenBrainzPlaylistTrack => !!track);
}
