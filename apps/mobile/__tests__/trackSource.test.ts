import { isLibraryTrack, isSpokenWordTrack } from "@/utils/trackSource";

describe("track source", () => {
  it("treats podcast episodes and audiobook files as spoken word", () => {
    expect(isSpokenWordTrack({ id: "e", source: "podcast" })).toBe(true);
    expect(isSpokenWordTrack({ id: "b", source: "audiobook" })).toBe(true);
    expect(isSpokenWordTrack({ id: "s" })).toBe(false);
    expect(isSpokenWordTrack(null)).toBe(false);
  });

  it("only counts music the library knows by id", () => {
    expect(isLibraryTrack({ id: "s" })).toBe(true);
    expect(isLibraryTrack({ id: "r", isRadio: true, source: "server" })).toBe(
      false,
    );
    expect(isLibraryTrack({ id: "b", source: "audiobook" })).toBe(false);
    expect(isLibraryTrack(undefined)).toBe(false);
  });
});
