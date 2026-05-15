export type BaseItemDto = {
  Id: string;
  Name?: string;
  ServerId?: string;
  Type?: string;
  MediaType?: string;
  IsFolder?: boolean;
  ParentId?: string;
  Album?: string;
  AlbumId?: string;
  AlbumArtist?: string;
  AlbumArtists?: { Id: string; Name: string }[];
  Artists?: string[];
  ArtistItems?: { Id: string; Name: string }[];
  RunTimeTicks?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ProductionYear?: number;
  Container?: string;
  Path?: string;
  CommunityRating?: number;
  CriticRating?: number;
  DateCreated?: string;
  PremiereDate?: string;
  Genres?: string[];
  GenreItems?: { Id: string; Name: string }[];
  ChildCount?: number;
  AlbumCount?: number;
  SongCount?: number;
  PlayedCount?: number;
  Overview?: string;
  ImageTags?: { Primary?: string; Backdrop?: string; Logo?: string };
  AlbumPrimaryImageTag?: string;
  ParentBackdropItemId?: string;
  BackdropImageTags?: string[];
  CollectionType?: string;
  UserData?: {
    IsFavorite?: boolean;
    Likes?: boolean;
    PlayCount?: number;
    PlaybackPositionTicks?: number;
    LastPlayedDate?: string;
    Rating?: number;
  };
  ProviderIds?: { MusicBrainzAlbum?: string; MusicBrainzArtist?: string };
  MediaSources?: {
    Bitrate?: number;
    Size?: number;
    Container?: string;
    Path?: string;
    MediaStreams?: {
      Type?: string;
      BitRate?: number;
      Channels?: number;
      SampleRate?: number;
      Codec?: string;
    }[];
  }[];
};

export type JellyfinPlaylistDto = {
  OpenAccess?: boolean;
  Shares?: { UserId: string; CanEdit: boolean }[];
  ItemIds?: string[];
};

export type JellyfinItemsResult = {
  Items: BaseItemDto[];
  TotalRecordCount?: number;
  StartIndex?: number;
};
