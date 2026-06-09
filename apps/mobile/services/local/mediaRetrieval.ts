import { queryTrackById } from "@/services/local/repository";
import { localEnvelope } from "@/services/local/unsupported";
import type { Lyrics, StructuredLyrics } from "@/services/openSubsonic/types";

// Playback itself doesn't go through these dispatched endpoints — the player
// builds a `file://` source synchronously via utils/streaming.ts#streamUrl and
// artwork via utils/artwork.ts#artworkUrl. What's left here is lyrics, which the
// indexer already extracted into the `tracks.lyrics` column (unsynced text).

export const getLyricsBySongId = async (
  id: string,
  _opts: { enhanced?: boolean } = {},
) => {
  const row = await queryTrackById(id);
  const text = row?.lyrics?.trim();
  if (!text) {
    return localEnvelope({ lyricsList: { structuredLyrics: [] } });
  }
  // Embedded tags only ever carry unsynced lyrics, so emit a single
  // unsynchronized block (no per-line timestamps).
  const structured: StructuredLyrics = {
    lang: "und",
    synced: false,
    line: text.split(/\r?\n/).map((value) => ({ value })),
    displayArtist: row?.artist ?? undefined,
    displayTitle: row?.title ?? undefined,
  };
  return localEnvelope({
    lyricsList: { structuredLyrics: [structured] },
  });
};

export const getLyrics = async (_params: {
  artist?: string;
  title?: string;
}) => {
  // Legacy by-name lookup; the local index keys lyrics by track id instead.
  const lyrics: Lyrics = {};
  return localEnvelope({ lyrics });
};
