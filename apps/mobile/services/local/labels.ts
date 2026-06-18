import i18n from "@/config/i18n";

// Locale-aware display fallbacks for local items whose tags are missing. These
// are *display only*: album/artist grouping keys are computed at index time from
// the real tag values (null → empty key), so the rendered label can change with
// the locale without ever affecting whether an item is retrievable. Resolved
// lazily (function form) so they reflect the active locale at map time, not the
// locale that happened to be active when this module was first imported.

export const unknownTitle = (): string => i18n.t("app.shared.unknown");
export const unknownAlbumLabel = (): string =>
  i18n.t("app.shared.unknownAlbum");
export const unknownArtistLabel = (): string =>
  i18n.t("app.shared.unknownArtist");
export const unknownEpisodeLabel = (): string =>
  i18n.t("app.shared.unknownEpisode");
