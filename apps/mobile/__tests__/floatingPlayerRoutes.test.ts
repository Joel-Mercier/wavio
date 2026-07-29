// The hide list and the bottom padding every scrollable screen reserves are the
// same decision read twice (useScreenBottomPadding calls this). A route that
// hides the player but still reserves room for it leaves a dead band under the
// list; one that shows it without reserving room hides the last row behind it.
import { hidesFloatingPlayer } from "@/utils/floatingPlayerRoutes";

describe("hidesFloatingPlayer", () => {
  it("hides on the routes that own the whole screen", () => {
    for (const path of [
      "/player",
      "/lyrics",
      "/playlists/new",
      "/playlists/new-ai",
      "/playlists/new-fingerprint",
      "/playlists/new-smart",
      "/internet-radio-stations/new",
      "/podcast-channels/new",
      "/playlists/abc123/edit-rules",
    ]) {
      expect(hidesFloatingPlayer(path)).toBe(true);
    }
  });

  it("keeps the player on ordinary browsing routes", () => {
    for (const path of [
      "/",
      "/playlists",
      "/playlists/abc123",
      "/podcast-channels",
      "/search",
    ]) {
      expect(hidesFloatingPlayer(path)).toBe(false);
    }
  });
});
