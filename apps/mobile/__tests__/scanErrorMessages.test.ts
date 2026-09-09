// Every error code the scan can surface must have copy behind it.
//
// The scan gate used to render `status.error` verbatim, so a user on cellular was
// shown the literal string `ERR_SCAN_METERED_NETWORK` and every other failure
// showed a raw AxiosError message. Codes now go through a lookup — which only
// helps if the lookup is complete, and a missing entry fails silently (i18next
// renders the key path). This test is the thing that notices.

import { scanErrorKey } from "@/components/local/scanStep";
import en from "@/i18n/en.json";
import type { FileSourceErrorCode } from "@/services/fileSource/errors";

// The real lookup, not a copy of it: `scanStep` holds nothing but the map and a
// type import, so asserting against it costs none of the native UI graph the
// gate and the settings screen drag in.

// The scanner's own codes, which have no union to enumerate.
const SCAN_CODES = ["ERR_SCAN_METERED_NETWORK", "ERR_SCAN_NO_FOLDERS"] as const;

// The union has no runtime form, so this list is the thing that has to be kept
// in step with it — the satisfies below is what enforces that at compile time.
const ALL_FILE_SOURCE_CODES = [
  "ERR_FS_AUTH",
  "ERR_FS_NOT_FOUND",
  "ERR_FS_UNREACHABLE",
  "ERR_FS_NOT_SUPPORTED",
  "ERR_FS_SERVER",
] as const satisfies readonly FileSourceErrorCode[];

const lookup = (path: string): unknown =>
  path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, en.translation);

describe("scan error copy", () => {
  it.each([...ALL_FILE_SOURCE_CODES, ...SCAN_CODES])(
    "has a message of its own for %s",
    (code) => {
      const key = scanErrorKey(code);
      // A code that fell through to the fallback is an unmapped code: the user
      // gets "something went wrong" instead of what actually happened.
      expect(key).not.toBe("app.localIndexing.errors.generic");
      expect(typeof lookup(key)).toBe("string");
    },
  );

  it("has a fallback for an unclassified failure", () => {
    expect(typeof lookup(scanErrorKey(undefined))).toBe("string");
    expect(typeof lookup(scanErrorKey("ERR_SOMETHING_NEW"))).toBe("string");
  });
});

describe("scan progress copy", () => {
  // `{{count}}` strings need explicit _one/_other in the source locale, or
  // languages with richer plural rules never receive _few/_many from Crowdin.
  it.each(["folderCountLabel", "partialScanWarning"])(
    "%s has both plural forms",
    (key) => {
      expect(typeof lookup(`app.localIndexing.${key}_one`)).toBe("string");
      expect(typeof lookup(`app.localIndexing.${key}_other`)).toBe("string");
    },
  );

  it("has copy for the foreground-service notification and the stop action", () => {
    expect(typeof lookup("app.localIndexing.notificationText")).toBe("string");
    expect(typeof lookup("app.localIndexing.stop")).toBe("string");
  });
});

describe("webdav setup hints", () => {
  it.each([
    "webdavNotAShare",
    "webdavMethodBlocked",
    "webdavPathNotFound",
    "webdavRedirected",
  ])("has copy for %s", (key) => {
    expect(typeof lookup(`auth.login.${key}`)).toBe("string");
  });
});

describe("playback notices", () => {
  it("has copy for an unavailable source", () => {
    expect(typeof lookup("app.player.notices.sourceUnavailable")).toBe(
      "string",
    );
  });
});
