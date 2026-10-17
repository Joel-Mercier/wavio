// Jellyfin's scrobbler plugins (Last.fm, ListenBrainz) only submit on
// /Sessions/Playing/Stopped when PositionTicks shows half the track or four
// minutes were heard, so a counted play must carry its real position.
const mockPost = jest.fn();

jest.mock("@/services/jellyfin/index", () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockPost(...args) },
  getDeviceId: () => "device",
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ jellyfinUserId: "user" }) },
}));

import { scrobble } from "@/services/jellyfin/mediaAnnotation";

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: {} });
});

test("now playing starts a playback session", async () => {
  await scrobble("t1", { submission: false });
  expect(mockPost).toHaveBeenCalledWith("/Sessions/Playing", {
    ItemId: "t1",
    CanSeek: true,
    IsPaused: false,
  });
});

test("a counted play stops the session at the position it was counted", async () => {
  await scrobble("t1", { submission: true, positionSeconds: 106.5 });
  expect(mockPost).toHaveBeenCalledWith("/Sessions/Playing/Stopped", {
    ItemId: "t1",
    PositionTicks: 1_065_000_000,
  });
});

test("a play queued before positions were stored reports 0", async () => {
  await scrobble("t1", { submission: true, time: 1 });
  expect(mockPost).toHaveBeenCalledWith("/Sessions/Playing/Stopped", {
    ItemId: "t1",
    PositionTicks: 0,
  });
});
