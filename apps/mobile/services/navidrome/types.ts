import type { SmartPlaylistCriteria } from "@/services/navidrome/smartPlaylists";

export interface NavidromePlaylist {
  id: string;
  name: string;
  comment?: string;
  ownerId?: string;
  ownerName?: string;
  public?: boolean;
  songCount?: number;
  duration?: number;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
  rules?: SmartPlaylistCriteria | null;
}

export type NavidromePlaylistDetail = NavidromePlaylist;

// Subset of a Navidrome native-API song (`GET /api/song`) — only the fields we
// map onto the Subsonic `Child` shape. Navidrome returns camelCase, durations in
// seconds and bitrate in kbps (unlike the Subsonic getRandomSongs response).
export interface NavidromeSong {
  id: string;
  title: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  albumArtist?: string;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  duration?: number;
  size?: number;
  suffix?: string;
  bitRate?: number;
  playCount?: number;
  starred?: boolean;
  starredAt?: string;
  path?: string;
  mbzTrackId?: string;
}

// `GET /api/album`. Field names are the JSON tags of Navidrome's model.Album,
// i.e. the camelCase form of the `album` table columns.
export interface NavidromeAlbum {
  id: string;
  name: string;
  albumArtist?: string;
  albumArtistId?: string;
  artist?: string;
  artistId?: string;
  maxYear?: number;
  minYear?: number;
  date?: string;
  songCount?: number;
  duration?: number;
  size?: number;
  genre?: string;
  compilation?: boolean;
  playCount?: number;
  playDate?: string;
  rating?: number;
  starred?: boolean;
  starredAt?: string;
  createdAt?: string;
  mbzAlbumId?: string;
  sortAlbumName?: string;
}

export interface NavidromeUser {
  id: string;
  userName: string;
  name: string;
  email: string;
  isAdmin: boolean;
  lastLoginAt?: string;
  lastAccessAt?: string;
  createdAt?: string;
  updatedAt?: string;
  libraries?: NavidromeLibrary[];
}

export interface NavidromeLibrary {
  id: number;
  name: string;
  path?: string;
}

export interface NavidromeGenre {
  id: string;
  name: string;
}

export interface NavidromeAuthPayload {
  id: string;
  name: string;
  username: string;
  isAdmin: boolean;
  token: string;
  subsonicSalt?: string;
  subsonicToken?: string;
  avatar?: string;
}

export interface NavidromeUpdateUserBody {
  userName: string;
  name: string;
  email: string;
  isAdmin: boolean;
  password?: string;
  currentPassword?: string;
}

export interface NavidromeCreateUserBody {
  userName: string;
  name?: string;
  email?: string;
  isAdmin?: boolean;
  password: string;
}
