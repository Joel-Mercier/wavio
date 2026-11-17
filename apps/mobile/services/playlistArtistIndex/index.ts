import { isNavidromeNative } from "@/services/backend/dispatch";
import { reportError } from "@/services/errorReporting";
import { getVisibleSmartPlaylists } from "@/services/navidrome/playlists";
import { isNotFoundError } from "@/services/notFound";
import type {
  Playlist,
  Playlists,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import {
  entryFromPlaylist,
  hashRules,
  type ListedPlaylist,
  planRefresh,
  playlistSignature,
  playlistsForArtist,
} from "@/services/playlistArtistIndex/plan";
import {
  deleteEntry,
  isLoaded,
  readEntries,
  readListing,
  scopeGeneration,
  writeEntry,
  writeListing,
} from "@/services/playlistArtistIndex/storage";
import { currentAuthScope } from "@/stores/auth";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";

const FETCH_CONCURRENCY = 3;
const REFRESH_COOLDOWN_MS = 30_000;
const RETRY_BASE_MS = 5 * 60_000;
const RETRY_MAX_MS = 6 * 60 * 60_000;

export type PlaylistSource = {
  listPlaylists: () => Promise<{ playlists?: Playlists }>;
  loadPlaylist: (id: string) => Promise<{ playlist?: PlaylistWithSongs }>;
};

type ScopeState = {
  generation: number;
  inFlight?: Promise<void>;
  refreshedAt: number;
  failures: Map<string, { count: number; retryAt: number }>;
};

const states = new Map<string, ScopeState>();

function stateFor(scope: string): ScopeState {
  const generation = scopeGeneration(scope);
  let state = states.get(scope);
  if (state?.generation !== generation) {
    state = { generation, refreshedAt: 0, failures: new Map() };
    states.set(scope, state);
  }
  return state;
}

function isCurrent(scope: string, generation: number): boolean {
  return currentAuthScope() === scope && scopeGeneration(scope) === generation;
}

async function smartPlaylistRules(): Promise<Map<string, string>> {
  if (!isNavidromeNative()) return new Map();
  try {
    const smart = await getVisibleSmartPlaylists();
    return new Map(smart.map((p) => [p.id, hashRules(p.rules)]));
  } catch {
    return new Map();
  }
}

async function runRefresh(
  scope: string,
  source: PlaylistSource,
  state: ScopeState,
) {
  const current = () => isCurrent(scope, state.generation);
  const [listing, rules] = await Promise.all([
    source.listPlaylists(),
    smartPlaylistRules(),
  ]);
  if (!current()) return;
  const playlists = listing.playlists?.playlist ?? [];
  const listed: ListedPlaylist[] = playlists.map((playlist) => ({
    playlist,
    smart: !!playlist.validUntil || rules.has(playlist.id),
    rulesHash: rules.get(playlist.id),
  }));
  writeListing(scope, playlists);
  const now = Date.now();
  const plan = planRefresh(
    listed,
    readEntries(scope),
    now,
    (id) => (state.failures.get(id)?.retryAt ?? 0) > now,
  );
  for (const id of plan.drop) {
    deleteEntry(scope, id);
    state.failures.delete(id);
  }

  const byId = new Map(listed.map((item) => [item.playlist.id, item]));
  await mapWithConcurrency(plan.fetch, FETCH_CONCURRENCY, async (id) => {
    if (!current()) return;
    const item = byId.get(id);
    if (!item) return;
    try {
      const { playlist } = await source.loadPlaylist(id);
      if (!playlist || !current()) return;
      state.failures.delete(id);
      // The listing's signature, not the detail's: it is what the next refresh
      // compares against, so storing anything else could refetch forever.
      writeEntry(
        scope,
        id,
        entryFromPlaylist(playlist, {
          signature: playlistSignature(item.playlist),
          rulesHash: item.rulesHash,
          now: Date.now(),
        }),
      );
    } catch (error) {
      if (!current()) return;
      if (isNotFoundError(error)) {
        deleteEntry(scope, id);
        return;
      }
      const count = (state.failures.get(id)?.count ?? 0) + 1;
      const wait = Math.min(RETRY_BASE_MS * 2 ** (count - 1), RETRY_MAX_MS);
      state.failures.set(id, { count, retryAt: Date.now() + wait });
    }
  });
  if (current() && !plan.more) state.refreshedAt = Date.now();
}

export function refreshPlaylistArtistIndex(
  scope: string,
  source: PlaylistSource,
): Promise<void> {
  const state = stateFor(scope);
  if (state.inFlight) return state.inFlight;
  if (Date.now() - state.refreshedAt < REFRESH_COOLDOWN_MS) {
    return Promise.resolve();
  }
  const run = runRefresh(scope, source, state).finally(() => {
    state.inFlight = undefined;
  });
  state.inFlight = run;
  return run;
}

export function cachedArtistPlaylists(
  scope: string,
  artistId: string,
): Playlist[] {
  return playlistsForArtist(artistId, readListing(scope), readEntries(scope));
}

// For render paths: parsing a cold index is a long synchronous read, so it is
// left to the query and only an already loaded one answers here.
export function loadedArtistPlaylists(
  scope: string,
  artistId: string,
): Playlist[] | undefined {
  return isLoaded(scope) ? cachedArtistPlaylists(scope, artistId) : undefined;
}

export async function indexedArtistPlaylists(
  artistId: string,
  source: PlaylistSource,
): Promise<Playlist[]> {
  const scope = currentAuthScope();
  readListing(scope);
  readEntries(scope);
  try {
    await refreshPlaylistArtistIndex(scope, source);
  } catch (error) {
    reportError(error, { area: "api", endpoint: "playlistArtistIndex" });
  }
  return cachedArtistPlaylists(scope, artistId);
}

// Any full playlist read elsewhere (the playlist screen, automatic downloads)
// refreshes its entry for free. Only an already-indexed playlist is updated, so
// a read can never add one the listing doesn't (or no longer does) show, and it
// keeps the listing's signature for the same reason runRefresh does.
export function beginPlaylistRead(): (
  playlist: PlaylistWithSongs | undefined,
) => void {
  const scope = currentAuthScope();
  const generation = scopeGeneration(scope);
  return (playlist) => {
    if (!playlist?.id || !isCurrent(scope, generation)) return;
    const previous = readEntries(scope).get(playlist.id);
    const listed = readListing(scope).find((p) => p.id === playlist.id);
    if (!previous || !listed) return;
    writeEntry(
      scope,
      playlist.id,
      entryFromPlaylist(playlist, {
        signature: playlistSignature(listed),
        rulesHash: previous.rulesHash,
        now: Date.now(),
      }),
    );
  };
}

export function __resetPlaylistArtistIndexRefresh(): void {
  states.clear();
}
