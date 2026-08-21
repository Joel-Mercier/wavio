import { useQuery } from "@tanstack/react-query";
import { LISTENBRAINZ_NETWORK_MODE } from "@/hooks/listenBrainz/networkMode";
import { useListenBrainzEnabled } from "@/hooks/listenBrainz/useListenBrainzEnabled";
import { useCapabilities } from "@/hooks/useCapabilities";
import { matchTracksToLibrary } from "@/services/libraryMatch";
import {
  fetchCreatedForPlaylists,
  fetchPlaylist,
} from "@/services/listenBrainz/playlists";
import type { ListenBrainzPlaylistTrack } from "@/services/listenBrainz/types";
import { retryUnlessClientError } from "@/services/retry";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";

// Daily Jams is rebuilt once a day and the weekly pair once a week, so the list
// of them is close to static within a session.
const CREATED_FOR_STALE_TIME = 1000 * 60 * 30;
// A playlist mbid names one immutable set of tracks — tomorrow's Daily Jams is a
// different mbid — so there is nothing to refetch for.
const PLAYLIST_STALE_TIME = 1000 * 60 * 60 * 24;
// The library, by contrast, does change under us: a download finishing turns a
// missing row into a matched one.
const RESOLVE_STALE_TIME = 1000 * 60 * 60;

export function useListenBrainzCreatedFor({ enabled = true } = {}) {
  const { userName, isEnabled } = useListenBrainzEnabled(enabled);

  return useQuery({
    queryKey: ["listenbrainz", "createdFor", userName],
    queryFn: ({ signal }) => fetchCreatedForPlaylists({ signal }),
    enabled: isEnabled,
    staleTime: CREATED_FOR_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

export function useListenBrainzPlaylist(mbid: string | undefined) {
  const { isEnabled } = useListenBrainzEnabled(true);

  return useQuery({
    queryKey: ["listenbrainz", "playlist", mbid],
    queryFn: ({ signal }) => fetchPlaylist(mbid as string, { signal }),
    enabled: isEnabled && !!mbid,
    staleTime: PLAYLIST_STALE_TIME,
    networkMode: LISTENBRAINZ_NETWORK_MODE,
    retry: retryUnlessClientError,
  });
}

/**
 * Resolves a ListenBrainz playlist against the library.
 *
 * Unlike the two fetches above this one talks to the *music server*, so it keeps
 * react-query's default network mode: against an unreachable server it pauses
 * and serves the persisted result instead of firing fifty doomed searches.
 *
 * The key deliberately omits `tracks` — the mbid already pins exactly which
 * tracks these are, and hashing a fifty-element array on every render would cost
 * more than it protects. `musicFolderId` does belong in it: that one changes
 * within a session and changes the answer.
 */
export function useLibraryResolvedTracks(
  mbid: string | undefined,
  tracks: ListenBrainzPlaylistTrack[] | undefined,
  { enabled = true } = {},
) {
  const musicFolderId = useCurrentMusicFolderId();
  const { multiFieldSearch } = useCapabilities();

  return useQuery({
    queryKey: ["listenbrainz", "resolve", mbid, musicFolderId ?? null],
    queryFn: ({ signal }) =>
      matchTracksToLibrary(tracks ?? [], {
        musicFolderId,
        signal,
        multiFieldSearch,
      }),
    enabled: enabled && !!mbid && !!tracks?.length,
    staleTime: RESOLVE_STALE_TIME,
    // Per-track failures are already swallowed by the resolver, so a rejection
    // here means something systemic — retrying would re-run fifty searches.
    retry: false,
  });
}
