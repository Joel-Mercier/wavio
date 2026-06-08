import { useServerExtensionsBase } from "@/stores/serverExtensions";

describe("serverExtensions store", () => {
  beforeEach(() => {
    useServerExtensionsBase.getState().reset();
  });

  it("reports false for unknown extensions", () => {
    expect(
      useServerExtensionsBase.getState().hasExtension("playbackReport"),
    ).toBe(false);
  });

  it("reports true once an extension is advertised", () => {
    useServerExtensionsBase
      .getState()
      .setExtensions([{ name: "sonicSimilarity", versions: [1] }]);
    expect(
      useServerExtensionsBase.getState().hasExtension("sonicSimilarity"),
    ).toBe(true);
  });

  it("honours a minimum version", () => {
    useServerExtensionsBase
      .getState()
      .setExtensions([{ name: "playbackReport", versions: [1] }]);
    const { hasExtension } = useServerExtensionsBase.getState();
    expect(hasExtension("playbackReport", 1)).toBe(true);
    expect(hasExtension("playbackReport", 2)).toBe(false);
  });

  it("reset() clears advertised extensions", () => {
    useServerExtensionsBase
      .getState()
      .setExtensions([{ name: "playbackReport", versions: [1] }]);
    useServerExtensionsBase.getState().reset();
    expect(
      useServerExtensionsBase.getState().hasExtension("playbackReport"),
    ).toBe(false);
  });
});
