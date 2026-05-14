import i18n from "@/config/i18n";
import {
  getAlbum,
  getArtist,
  getTopSongs,
} from "@/services/openSubsonic/browsing";
import { getAlbumList2, getStarred2 } from "@/services/openSubsonic/lists";
import { getPlaylist, getPlaylists } from "@/services/openSubsonic/playlists";
import type {
  AlbumID3,
  AlbumWithSongsID3,
  ArtistID3,
  Child,
  Playlist,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import usePodcasts from "@/stores/podcasts";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import type { BrowseNode, BrowseTree } from "./types";
import { ROOT_ID } from "./types";

// In-memory snapshots used by play.ts to resolve leaf mediaIds without
// refetching. Refreshed every time buildBrowseTree() runs.
type Snapshot = {
  // Songs known by their direct id (starred songs, playlist tracks, album
  // tracks). Used by `track:<id>` resolver.
  tracks: Map<string, Child>;
  // Resolved playlists (with entries) so taps can play immediately.
  playlists: Map<string, PlaylistWithSongs>;
  // Resolved albums (with songs).
  albums: Map<string, AlbumWithSongsID3>;
  // Top songs cached by artist id.
  artistTopSongs: Map<string, Child[]>;
  // Ordered list of track mediaIds (e.g. "track:abc") per browse parent. Used
  // by handleBrowsePlay to enqueue the whole collection the user was in when
  // they tapped a track, starting at the tapped index.
  parentTracks: Map<string, string[]>;
};

const snapshot: Snapshot = {
  tracks: new Map(),
  playlists: new Map(),
  albums: new Map(),
  artistTopSongs: new Map(),
  parentTracks: new Map(),
};

export const getSnapshot = () => snapshot;

// Record the playable mediaIds in `nodes` (in order) for a given parent so
// the play resolver can enqueue the surrounding collection when the user taps
// a track in Android Auto.
const recordParentTracks = (parentId: string, nodes: BrowseNode[]) => {
  const ids = nodes.filter((n) => n.playable).map((n) => n.id);
  if (ids.length > 0) snapshot.parentTracks.set(parentId, ids);
};

const albumNode = (a: AlbumID3, browsable = true): BrowseNode => ({
  id: `album:${a.id}`,
  title: a.name,
  subtitle: a.artist,
  artworkUrl: a.coverArt ? artworkUrl(a.coverArt) : undefined,
  playable: !browsable,
  contentStyle: browsable ? "list" : undefined,
});

const playlistNode = (p: Playlist | PlaylistWithSongs): BrowseNode => ({
  id: `playlist:${p.id}`,
  title: p.name,
  subtitle: p.songCount
    ? i18n.t("app.carAuto.songCount", { count: p.songCount })
    : undefined,
  artworkUrl: p.coverArt ? artworkUrl(p.coverArt) : undefined,
  playable: false,
  contentStyle: "list",
});

const artistNode = (a: ArtistID3): BrowseNode => ({
  id: `artist:${a.id}`,
  title: a.name,
  artworkUrl: a.coverArt ? artworkUrl(a.coverArt) : undefined,
  playable: false,
  contentStyle: "list",
});

// Track mediaIds embed the parent that produced them so the play handler can
// enqueue the right collection. The same song can appear under many parents
// (a playlist, the favorites list, the album it belongs to, an artist's top
// songs, a home section), and Android Auto doesn't tell us which parent the
// user was browsing when they tapped — relying on a "last-browsed" hint is
// racy because AA prefetches siblings/related parents around playback. By
// making each (parent, song) pair its own mediaId we always know the source.
const trackNode = (c: Child, parentId: string): BrowseNode => {
  snapshot.tracks.set(c.id, c);
  return {
    id: `track|${parentId}|${c.id}`,
    title: c.title ?? "Unknown",
    subtitle: c.artist,
    artworkUrl: c.coverArt ? artworkUrl(c.coverArt) : undefined,
    playable: true,
  };
};

const HOME_SECTIONS: Array<{
  id: string;
  titleKey: string;
  type: "recent" | "newest" | "frequent" | "highest" | "random";
}> = [
  {
    id: "home:section:recent",
    titleKey: "app.carAuto.recentlyPlayed",
    type: "recent",
  },
  {
    id: "home:section:newest",
    titleKey: "app.carAuto.recentlyAdded",
    type: "newest",
  },
  {
    id: "home:section:frequent",
    titleKey: "app.carAuto.mostPlayed",
    type: "frequent",
  },
  {
    id: "home:section:highest",
    titleKey: "app.carAuto.topRated",
    type: "highest",
  },
  { id: "home:section:random", titleKey: "app.carAuto.random", type: "random" },
];

const HOME_SECTION_SIZE = 20;

export async function buildBrowseTree(): Promise<BrowseTree> {
  // Reset snapshots; everything is repopulated below.
  snapshot.tracks.clear();
  snapshot.playlists.clear();
  snapshot.albums.clear();
  snapshot.artistTopSongs.clear();
  snapshot.parentTracks.clear();

  const tree: BrowseTree = {};

  // === Root ===
  tree[ROOT_ID] = [
    {
      id: "tab:home",
      title: i18n.t("app.carAuto.home"),
      playable: false,
      contentStyle: "list",
    },
    {
      id: "tab:recent",
      title: i18n.t("app.carAuto.recentlyPlayed"),
      playable: false,
      contentStyle: "list",
    },
    {
      id: "tab:library",
      title: i18n.t("app.carAuto.library"),
      playable: false,
      contentStyle: "list",
    },
  ];

  // === Home tab ===
  const homeSectionsResults = await Promise.all(
    HOME_SECTIONS.map(async (s) => {
      const rsp = await getAlbumList2(s.type, {
        size: HOME_SECTION_SIZE,
      }).catch(() => null);
      return { section: s, albums: rsp?.albumList2?.album ?? [] };
    }),
  );

  tree["tab:home"] = HOME_SECTIONS.map((s) => ({
    id: s.id,
    title: i18n.t(s.titleKey),
    playable: false,
    contentStyle: "grid",
  }));

  // Collect album-detail prefetch jobs across Home + Library so we issue them
  // once and dedupe.
  const albumIdsToFetch = new Set<string>();

  for (const { section, albums } of homeSectionsResults) {
    tree[section.id] = albums.map((a) => albumNode(a, true));
    for (const a of albums) albumIdsToFetch.add(a.id);
  }

  // === Recently Played tab ===
  const recentPlays = useRecentPlays.getState().recentPlays;
  tree["tab:recent"] = recentPlays
    // Skip the favorites pseudo-entry; Library → Playlists → Favorites covers it.
    .filter((p) => p.type !== "favorites")
    .map((p) => {
      // Albums and playlists from recents become browsable so the user can
      // drill into the tracklist; artists open their detail screen; internet
      // radio stations are direct play.
      if (p.type === "album") {
        albumIdsToFetch.add(p.id);
        return {
          id: `album:${p.id}`,
          title: p.title,
          artworkUrl: p.coverArt ? artworkUrl(p.coverArt) : undefined,
          playable: false,
          contentStyle: "list",
        };
      }
      if (p.type === "playlist") {
        return {
          id: `playlist:${p.id}`,
          title: p.title,
          artworkUrl: p.coverArt ? artworkUrl(p.coverArt) : undefined,
          playable: false,
          contentStyle: "list",
        };
      }
      if (p.type === "artist") {
        return {
          id: `artist:${p.id}`,
          title: p.title,
          artworkUrl: p.coverArt ? artworkUrl(p.coverArt) : undefined,
          playable: false,
          contentStyle: "list",
        };
      }
      // internetRadioStation
      return {
        id: `radio:${p.id}`,
        title: p.title,
        artworkUrl: p.coverArt ? artworkUrl(p.coverArt) : undefined,
        playable: true,
      };
    });

  // === Library tab ===
  const [playlistsRsp, starredRsp] = await Promise.all([
    getPlaylists({}).catch(() => null),
    getStarred2({}).catch(() => null),
  ]);

  const libraryChildren: BrowseNode[] = [
    {
      id: "lib:playlists",
      title: i18n.t("app.carAuto.playlists"),
      playable: false,
      contentStyle: "list",
    },
    {
      id: "lib:albums",
      title: i18n.t("app.carAuto.albums"),
      playable: false,
      contentStyle: "grid",
    },
  ];

  // Library → Playlists (Favorites first, then user playlists)
  const userPlaylists = playlistsRsp?.playlists?.playlist ?? [];
  const starredSongs = starredRsp?.starred2?.song ?? [];
  for (const s of starredSongs) snapshot.tracks.set(s.id, s);

  tree["lib:playlists"] = [
    {
      id: "favorites",
      title: i18n.t("app.carAuto.favorites"),
      subtitle: starredSongs.length
        ? i18n.t("app.carAuto.songCount", { count: starredSongs.length })
        : undefined,
      playable: false,
      contentStyle: "list",
    },
    ...userPlaylists.map(playlistNode),
  ];
  tree.favorites = starredSongs.map((s) => trackNode(s, "favorites"));
  recordParentTracks("favorites", tree.favorites);

  // Library → Albums (starred albums)
  const starredAlbums = starredRsp?.starred2?.album ?? [];
  tree["lib:albums"] = starredAlbums.map((a) => albumNode(a, true));
  for (const a of starredAlbums) albumIdsToFetch.add(a.id);

  // Library → Podcasts (only if Taddy is configured + favorites exist)
  const podcastsState = usePodcasts.getState();
  const podcastsEnabled = Boolean(
    podcastsState.taddyPodcastsApiKey && podcastsState.taddyPodcastsUserId,
  );
  if (podcastsEnabled) {
    const favPodcasts = podcastsState.favoritePodcasts;
    libraryChildren.push({
      id: "lib:podcasts",
      title: i18n.t("app.carAuto.podcasts"),
      playable: false,
      contentStyle: "grid",
    });
    tree["lib:podcasts"] = favPodcasts.map((p) => ({
      // Podcast playback is not wired through the Subsonic stream pipeline,
      // so leave the entry browsable but childless for now (taps no-op).
      // A follow-up can attach episode lists from Taddy.
      id: `podcast:${p.uuid}`,
      title: p.name,
      subtitle: p.authorName,
      artworkUrl: p.imageUrl,
      playable: false,
      contentStyle: "list",
    }));
    for (const p of favPodcasts) {
      tree[`podcast:${p.uuid}`] = [];
    }
  }

  tree["tab:library"] = libraryChildren;

  // Starred artists from recents → preload top-songs for each so the artist
  // detail screen renders without a blocking request when tapped.
  const starredArtists = starredRsp?.starred2?.artist ?? [];
  // Track all artist ids we need to expand into detail screens.
  const artistIdsToFetch = new Set<string>();
  for (const r of recentPlays) {
    if (r.type === "artist") artistIdsToFetch.add(r.id);
  }
  for (const a of starredArtists) artistIdsToFetch.add(a.id);

  // === Prefetch playlist detail (tracklists) ===
  const playlistsToFetch = userPlaylists.map((p) => p.id);
  await Promise.all(
    playlistsToFetch.map(async (id) => {
      try {
        const rsp = await getPlaylist(id);
        const pl = rsp.playlist;
        snapshot.playlists.set(id, pl);
        const entries = pl.entry ?? [];
        for (const e of entries) snapshot.tracks.set(e.id, e);
        const parent = `playlist:${id}`;
        tree[parent] = entries.map((e) => trackNode(e, parent));
        recordParentTracks(parent, tree[parent]);
      } catch {
        tree[`playlist:${id}`] = [];
      }
    }),
  );

  // === Prefetch album detail ===
  await Promise.all(
    Array.from(albumIdsToFetch).map(async (id) => {
      try {
        const rsp = await getAlbum(id);
        const album = rsp.album;
        snapshot.albums.set(id, album);
        const songs = album.song ?? [];
        for (const s of songs) snapshot.tracks.set(s.id, s);
        const parent = `album:${id}`;
        tree[parent] = songs.map((s) => trackNode(s, parent));
        recordParentTracks(parent, tree[parent]);
      } catch {
        tree[`album:${id}`] = [];
      }
    }),
  );

  // === Prefetch artist detail (top songs + albums) ===
  await Promise.all(
    Array.from(artistIdsToFetch).map(async (id) => {
      try {
        const artistRsp = await getArtist(id);
        const artist = artistRsp.artist;
        const albums = artist.album ?? [];
        let topSongs: Child[] = [];
        if (artist.name) {
          const topRsp = await getTopSongs(artist.name, { count: 10 }).catch(
            () => null,
          );
          topSongs = topRsp?.topSongs?.song ?? [];
        }
        snapshot.artistTopSongs.set(id, topSongs);
        for (const s of topSongs) snapshot.tracks.set(s.id, s);
        // Children: top songs (playable) followed by albums (browsable). Drill
        // into each album to see its tracks.
        const artistParent = `artist:${id}`;
        const children: BrowseNode[] = [
          ...topSongs.map((s) => trackNode(s, artistParent)),
          ...albums.map((a) => albumNode(a, true)),
        ];
        tree[artistParent] = children;
        recordParentTracks(artistParent, children);
        // Ensure each linked album also has a tracklist node prefetched.
        for (const a of albums) {
          const albumParent = `album:${a.id}`;
          if (!tree[albumParent]) {
            try {
              const rsp = await getAlbum(a.id);
              const songs = rsp.album.song ?? [];
              snapshot.albums.set(a.id, rsp.album);
              for (const s of songs) snapshot.tracks.set(s.id, s);
              tree[albumParent] = songs.map((s) => trackNode(s, albumParent));
              recordParentTracks(albumParent, tree[albumParent]);
            } catch {
              tree[albumParent] = [];
            }
          }
        }
      } catch {
        tree[`artist:${id}`] = [];
      }
    }),
  );

  return tree;
}
