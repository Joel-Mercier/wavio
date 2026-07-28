// Routes that own the whole screen and would be covered — or crowded — by the
// floating player. Its own module because two places must agree on it and
// neither owns it: FloatingPlayer decides whether to render, and
// useScreenBottomPadding decides how much room every scrollable screen reserves.
// Disagreement is silently wrong either way — a dead band under the list, or a
// last row stuck behind the player.

// Creation forms whose submit button sits at the bottom of the screen, where the
// player would cover it.
const HIDDEN_ROUTES = [
  "/player",
  "/lyrics",
  "/playlists/new",
  "/playlists/new-ai",
  "/playlists/new-fingerprint",
  "/playlists/new-smart",
  "/internet-radio-stations/new",
  "/podcast-channels/new",
];

// Matching is exact (bar the nested /edit-rules) so each creation route opts in
// by name rather than by sharing a prefix — /playlists/new-ai,
// /playlists/new-fingerprint and /playlists/new-smart are their own screens, not
// sub-routes of /playlists/new.
export function hidesFloatingPlayer(pathname: string): boolean {
  return HIDDEN_ROUTES.includes(pathname) || pathname.includes("/edit-rules");
}
