import { isNewer, parseVersion } from "@/services/appUpdate/version";

describe("appUpdate/version", () => {
  describe("parseVersion", () => {
    it("parses a plain version", () => {
      expect(parseVersion("1.0.8")).toEqual({ major: 1, minor: 0, patch: 8 });
    });

    it("strips a leading v (GitHub tag form)", () => {
      expect(parseVersion("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it("ignores a pre-release suffix", () => {
      expect(parseVersion("v2.0.0-beta.1")).toEqual({
        major: 2,
        minor: 0,
        patch: 0,
      });
    });

    it("returns null for malformed or empty input", () => {
      expect(parseVersion("nightly")).toBeNull();
      expect(parseVersion("1.2")).toBeNull();
      expect(parseVersion("")).toBeNull();
      expect(parseVersion(null)).toBeNull();
      expect(parseVersion(undefined)).toBeNull();
    });
  });

  describe("isNewer", () => {
    it("treats a v-prefixed tag as newer than the bare running version", () => {
      expect(isNewer("v1.0.9", "1.0.8")).toBe(true);
    });

    it("is false when versions are equal (ignoring the v)", () => {
      expect(isNewer("v1.0.8", "1.0.8")).toBe(false);
    });

    it("is false when the latest is older", () => {
      expect(isNewer("1.0.7", "1.0.8")).toBe(false);
    });

    it("compares each component in order", () => {
      expect(isNewer("v2.0.0", "1.9.9")).toBe(true);
      expect(isNewer("v1.3.0", "1.2.9")).toBe(true);
      expect(isNewer("v1.2.10", "1.2.9")).toBe(true);
    });

    it("is false when either side is unparseable", () => {
      expect(isNewer("nightly", "1.0.8")).toBe(false);
      expect(isNewer("v1.0.9", null)).toBe(false);
    });
  });
});
