import type { BaseItemDto } from "@/services/jellyfin/types";
import type {
  AlbumID3,
  AlbumWithSongsID3,
  ArtistID3,
  ArtistWithAlbumsID3,
  Child,
  Contributor,
  Genre,
  MusicFolder,
  Playlist,
  PlaylistWithSongs,
  ScanStatus,
  StructuredLyrics,
  User,
} from "@/services/openSubsonic/types";

const TICKS_PER_SECOND = 10_000_000;

function ticksToSeconds(ticks?: number): number {
  if (!ticks || !Number.isFinite(ticks)) return 0;
  return Math.round(ticks / TICKS_PER_SECOND);
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function favoriteAsStarred(item: BaseItemDto): Date | undefined {
  if (item.UserData?.IsFavorite) {
    return parseDate(item.UserData?.LastPlayedDate) ?? new Date(0);
  }
  return undefined;
}

export function mapBaseItemToChild(item: BaseItemDto): Child {
  const source = item.MediaSources?.[0];
  const audioStream = source?.MediaStreams?.find((s) => s.Type === "Audio");
  const bitRateBps = source?.Bitrate ?? audioStream?.BitRate;
  return {
    id: item.Id,
    title: item.Name ?? "",
    name: item.Name,
    isDir: false,
    type: "music",
    album: item.Album,
    albumId: item.AlbumId,
    artist: item.AlbumArtist ?? item.Artists?.join(", "),
    artistId: item.AlbumArtists?.[0]?.Id ?? item.ArtistItems?.[0]?.Id,
    artists: item.ArtistItems?.map((a) => ({ id: a.Id, name: a.Name })),
    duration: ticksToSeconds(item.RunTimeTicks),
    track: item.IndexNumber,
    discNumber: item.ParentIndexNumber,
    year: item.ProductionYear,
    suffix: (source?.Container ?? item.Container)?.split(",")[0]?.trim(),
    bitRate: bitRateBps ? Math.round(bitRateBps / 1000) : undefined,
    channelCount: audioStream?.Channels,
    size: source?.Size,
    path: source?.Path ?? item.Path,
    coverArt: item.AlbumId ?? item.Id,
    parent: item.ParentId,
    genre: item.Genres?.[0],
    genres: item.GenreItems?.map((g) => ({ name: g.Name })),
    playCount: item.UserData?.PlayCount,
    starred: favoriteAsStarred(item),
    userRating: item.UserData?.Rating,
    created: parseDate(item.DateCreated),
    played: parseDate(item.UserData?.LastPlayedDate),
    bookmarkPosition: item.UserData?.PlaybackPositionTicks
      ? ticksToSeconds(item.UserData.PlaybackPositionTicks)
      : undefined,
    musicBrainzId: item.ProviderIds?.MusicBrainzAlbum,
    displayAlbumArtist: item.AlbumArtist,
    displayComposer: mapComposers(item),
    contributors: mapContributors(item),
  };
}

function mapComposers(item: BaseItemDto): string | undefined {
  const fromComposers = item.Composers?.map((c) => c.Name).filter(
    (n): n is string => !!n,
  );
  if (fromComposers?.length) return fromComposers.join(", ");
  const fromPeople = item.People?.filter(
    (p) => p.Type === "Composer" && p.Name,
  ).map((p) => p.Name as string);
  return fromPeople?.length ? fromPeople.join(", ") : undefined;
}

function mapContributors(item: BaseItemDto): Contributor[] | undefined {
  if (!item.People?.length) return undefined;
  const contributors = item.People.filter((p) => p.Name).map((p) => ({
    role: (p.Type ?? p.Role ?? "").toLowerCase(),
    subRole: p.Type && p.Role && p.Type !== p.Role ? p.Role : undefined,
    artist: { id: p.Id ?? "", name: p.Name as string },
  }));
  return contributors.length ? contributors : undefined;
}

export function mapBaseItemToAlbum(item: BaseItemDto): AlbumID3 {
  return {
    id: item.Id,
    name: item.Name ?? "",
    artist: item.AlbumArtist ?? item.Artists?.join(", "),
    artistId: item.AlbumArtists?.[0]?.Id ?? item.ArtistItems?.[0]?.Id,
    artists: item.AlbumArtists?.map((a) => ({ id: a.Id, name: a.Name })),
    coverArt: item.Id,
    songCount: item.ChildCount ?? item.SongCount ?? 0,
    duration: ticksToSeconds(item.RunTimeTicks),
    created: parseDate(item.DateCreated) ?? new Date(0),
    year: item.ProductionYear,
    genres: item.GenreItems?.map((g) => ({
      value: g.Name,
      albumCount: 0,
      songCount: 0,
    })),
    starred: favoriteAsStarred(item),
    userRating: item.UserData?.Rating,
    playCount: item.UserData?.PlayCount,
    played: parseDate(item.UserData?.LastPlayedDate),
    displayArtist: item.AlbumArtist,
    musicBrainzId: item.ProviderIds?.MusicBrainzAlbum,
  };
}

export function mapBaseItemToAlbumWithSongs(
  item: BaseItemDto,
  tracks: BaseItemDto[],
): AlbumWithSongsID3 {
  return {
    ...mapBaseItemToAlbum(item),
    song: tracks.map(mapBaseItemToChild),
  };
}

export function mapBaseItemToArtist(item: BaseItemDto): ArtistID3 {
  return {
    id: item.Id,
    name: item.Name ?? "",
    albumCount: item.AlbumCount ?? item.ChildCount ?? 0,
    coverArt: item.Id,
    starred: favoriteAsStarred(item),
    userRating: item.UserData?.Rating,
    musicBrainzId: item.ProviderIds?.MusicBrainzArtist,
  };
}

export function mapBaseItemToArtistWithAlbums(
  item: BaseItemDto,
  albums: BaseItemDto[],
): ArtistWithAlbumsID3 {
  return {
    ...mapBaseItemToArtist(item),
    album: albums.map(mapBaseItemToAlbum),
  };
}

export function mapBaseItemToPlaylist(
  item: BaseItemDto,
  extra?: { openAccess?: boolean },
): Playlist {
  return {
    id: item.Id,
    name: item.Name ?? "",
    songCount: item.ChildCount ?? 0,
    duration: ticksToSeconds(item.RunTimeTicks),
    created: parseDate(item.DateCreated) ?? new Date(0),
    changed: parseDate(item.DateCreated) ?? new Date(0),
    coverArt: item.Id,
    public: extra?.openAccess ?? false,
  };
}

export function mapBaseItemToPlaylistWithSongs(
  item: BaseItemDto,
  tracks: BaseItemDto[],
  extra?: { openAccess?: boolean },
): PlaylistWithSongs {
  return {
    ...mapBaseItemToPlaylist(item, extra),
    entry: tracks.map(mapBaseItemToChild),
  };
}

export function mapMusicFolder(item: BaseItemDto, _index: number): MusicFolder {
  return { id: item.Id, name: item.Name };
}

export function mapJellyfinGenre(item: BaseItemDto): Genre {
  return {
    value: item.Name ?? "",
    albumCount: item.AlbumCount ?? 0,
    songCount: item.SongCount ?? 0,
  };
}

export function mapJellyfinUser(item: {
  Id: string;
  Name: string;
  Policy?: {
    IsAdministrator?: boolean;
    EnableAudioPlaybackTranscoding?: boolean;
  };
}): User {
  return {
    username: item.Name,
    adminRole: !!item.Policy?.IsAdministrator,
    commentRole: false,
    coverArtRole: false,
    downloadRole: true,
    jukeboxRole: false,
    playlistRole: true,
    podcastRole: false,
    scrobblingEnabled: true,
    settingsRole: !!item.Policy?.IsAdministrator,
    shareRole: false,
    streamRole: true,
    uploadRole: false,
    videoConversionRole: false,
  };
}

export function mapScanStatus(refreshInProgress: boolean): ScanStatus {
  return { scanning: refreshInProgress };
}

export type JellyfinLyricsResponse = {
  Lyrics?: { Start?: number; Text: string }[];
  Metadata?: { Lyricist?: string; Title?: string; IsSynced?: boolean };
};

export function mapJellyfinLyrics(
  payload: JellyfinLyricsResponse,
): StructuredLyrics | null {
  if (!payload?.Lyrics || payload.Lyrics.length === 0) return null;
  const synced = payload.Lyrics.some((l) => typeof l.Start === "number");
  return {
    lang: "und",
    synced,
    line: payload.Lyrics.map((l) => ({
      value: l.Text,
      start:
        typeof l.Start === "number"
          ? ticksToSeconds(l.Start) * 1000
          : undefined,
    })),
    displayTitle: payload.Metadata?.Title,
  };
}
