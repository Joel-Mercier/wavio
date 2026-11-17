// Navidrome's `smart` list filter returns only regular playlists whatever its
// value, so asking it for {"smart":true} made every regular playlist look smart.
const mockGet = jest.fn();
jest.mock("@/services/navidrome", () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockGet(...args) },
}));

import { getVisibleSmartPlaylists } from "@/services/navidrome/playlists";

it("keeps only the playlists that carry rules, from the unfiltered list", async () => {
  mockGet.mockResolvedValue({
    data: [
      { id: "regular", rules: null },
      { id: "smart", rules: { all: [{ is: { loved: true } }] } },
      { id: "plain" },
    ],
  });

  const smart = await getVisibleSmartPlaylists();

  expect(smart.map((p) => p.id)).toEqual(["smart"]);
  expect(mockGet).toHaveBeenCalledWith("/playlist");
});
