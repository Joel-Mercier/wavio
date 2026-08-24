// `getCapabilities` ends in `default: return SUBSONIC`, so a server type added
// without an explicit case silently advertises sharing, the jukebox, bookmarks
// and queue sync — features it has no endpoint for. These tests pin every
// index-backed type against the on-device library so that fallthrough can't
// happen quietly again.
import { getCapabilities } from "@/services/backend/capabilities";
import {
  isIndexBackedType,
  isNetworkShareType,
} from "@/services/backend/serverTraits";
import { serverTypeSchema } from "@/stores/servers";

// `stores/servers` reaches MMKV through config/storage on import; the schema is
// all this suite wants from it.
jest.mock("@/config/storage", () => ({
  storage: { set: () => {}, getString: () => null, remove: () => {} },
  zustandStorage: {
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  },
}));

describe("network share capabilities", () => {
  const local = getCapabilities("local");
  const subsonic = getCapabilities("opensubsonic");
  // Derived from the traits rather than listed, so a third share protocol is
  // covered the moment it is declared.
  const shareTypes = serverTypeSchema.options.filter(isNetworkShareType);

  it("covers both shipped share protocols", () => {
    expect([...shareTypes].sort()).toEqual(["smb", "webdav"]);
  });

  describe.each(shareTypes)("%s", (type) => {
    const share = getCapabilities(type);

    it("is not the Subsonic default", () => {
      expect(share).not.toEqual(subsonic);
      expect(share.sharing).toBe(false);
      expect(share.jukebox).toBe(false);
      expect(share.bookmarks).toBe(false);
      expect(share.playQueueSync).toBe(false);
      expect(share.adminUsers).toBe(false);
    });

    it("differs from the on-device library only in download and tag writing", () => {
      const differing = Object.keys(share).filter(
        (key) =>
          share[key as keyof typeof share] !== local[key as keyof typeof local],
      );
      expect(differing.sort()).toEqual(["offlineDownload", "tagWriting"]);
    });

    it("offers offline downloads — the reason the feature exists", () => {
      expect(local.offlineDownload).toBe(false);
      expect(share.offlineDownload).toBe(true);
    });

    it("does not offer tag writing", () => {
      // Would mean download -> retag -> re-upload, and an interrupted upload
      // destroys the user's only copy.
      expect(local.tagWriting).toBe(true);
      expect(share.tagWriting).toBe(false);
    });

    it("keeps casting off: a receiver cannot reach the share", () => {
      // WebDAV because a receiver can't carry the Authorization header; SMB
      // because the URL is a loopback bridge on this phone.
      expect(share.remoteStreamableUrl).toBe(false);
    });

    it("keeps the index-backed features the local library has", () => {
      expect(share.libraryScan).toBe(true);
      expect(share.setRating).toBe(true);
      expect(share.songLists).toBe(true);
      expect(share.replayGain).toBe(true);
      expect(share.lyricsSynced).toBe(true);
    });
  });

  it("returns a distinct matrix for every index-backed server type", () => {
    // A new type reaching `default` shows up here as an exact duplicate of the
    // Subsonic matrix.
    for (const type of serverTypeSchema.options) {
      if (!isIndexBackedType(type)) continue;
      expect(getCapabilities(type)).not.toEqual(subsonic);
    }
  });
});
