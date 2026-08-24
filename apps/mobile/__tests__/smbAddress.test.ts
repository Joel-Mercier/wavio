import {
  normalizeSmbRoot,
  parseSmbUrl,
  smbPathOf,
  splitDomainUser,
} from "@/services/fileSource/smbAddress";
import { localTrackId, parseLocalTrackId } from "@/services/local/keys";

// The share name lives in the URL and the NTLM domain in the username, so this
// parsing *is* the SMB server's configuration format. Nothing here touches the
// native module — that's the point of keeping it a separate, dependency-free
// file: `stores/servers` and `stores/auth` validate the login form with it.

describe("parseSmbUrl", () => {
  it("reads host, port and share", () => {
    expect(parseSmbUrl("smb://192.168.1.10/Music")).toEqual({
      host: "192.168.1.10",
      port: 445,
      share: "Music",
    });
    expect(parseSmbUrl("smb://nas.local:1445/Media")).toEqual({
      host: "nas.local",
      port: 1445,
      share: "Media",
    });
  });

  // The scanned sub-path is `Server.libraryPath`, deliberately not part of the
  // server's identity — narrowing it later must not invalidate any track id.
  it("ignores anything below the share", () => {
    expect(parseSmbUrl("smb://nas.local/Media/Music/FLAC")?.share).toBe(
      "Media",
    );
  });

  it("tolerates how people actually type an address", () => {
    const expected = { host: "nas.local", port: 445, share: "Music" };
    // No scheme: the field is labelled "server URL", so a bare host is natural.
    expect(parseSmbUrl("nas.local/Music")).toEqual(expected);
    expect(parseSmbUrl("//nas.local/Music")).toEqual(expected);
    // What Windows shows in its address bar.
    expect(parseSmbUrl("\\\\nas.local\\Music")).toEqual(expected);
    expect(parseSmbUrl("SMB://nas.local/Music/")).toEqual(expected);
    expect(parseSmbUrl("  smb://nas.local/Music  ")).toEqual(expected);
  });

  it("keeps an IPv6 literal intact", () => {
    expect(parseSmbUrl("smb://[fe80::1]:445/Music")).toEqual({
      host: "fe80::1",
      port: 445,
      share: "Music",
    });
  });

  // `z.url()` accepts `smb://host`, so this is the check that actually stops a
  // server being saved with no share to connect to.
  it("rejects an address with no share name", () => {
    expect(parseSmbUrl("smb://nas.local")).toBeNull();
    expect(parseSmbUrl("smb://nas.local/")).toBeNull();
    expect(parseSmbUrl("smb://")).toBeNull();
    expect(parseSmbUrl("")).toBeNull();
  });

  // A URL field carrying a scheme from another server type must not be read as a
  // host — better a clear validation failure than a connection somewhere odd.
  it("rejects a leftover http address", () => {
    expect(parseSmbUrl("https://nas.local/Music")).toBeNull();
  });

  it("rejects an impossible port", () => {
    expect(parseSmbUrl("smb://nas.local:0/Music")).toBeNull();
    expect(parseSmbUrl("smb://nas.local:99999/Music")).toBeNull();
  });
});

describe("splitDomainUser", () => {
  it("splits the Windows domain form", () => {
    expect(splitDomainUser("WORKGROUP\\joel")).toEqual({
      domain: "WORKGROUP",
      user: "joel",
    });
  });

  // The backslash is awkward on a phone keyboard.
  it("accepts a forward slash too", () => {
    expect(splitDomainUser("WORKGROUP/joel")).toEqual({
      domain: "WORKGROUP",
      user: "joel",
    });
  });

  it("leaves a plain username alone", () => {
    expect(splitDomainUser("  joel  ")).toEqual({ domain: "", user: "joel" });
  });
});

describe("normalizeSmbRoot", () => {
  it("turns a configured sub-path into an address", () => {
    expect(normalizeSmbRoot("/Music")).toBe("smb:/Music");
    expect(normalizeSmbRoot("Music")).toBe("smb:/Music");
    expect(normalizeSmbRoot("Music/FLAC/")).toBe("smb:/Music/FLAC");
    expect(normalizeSmbRoot("\\Music\\FLAC")).toBe("smb:/Music/FLAC");
  });

  it("treats an empty sub-path as the whole share", () => {
    expect(normalizeSmbRoot("")).toBe("smb:/");
    expect(normalizeSmbRoot("   ")).toBe("smb:/");
    expect(normalizeSmbRoot("/")).toBe("smb:/");
  });

  it("is idempotent, so a re-scan doesn't double the prefix", () => {
    expect(normalizeSmbRoot(normalizeSmbRoot("/Music"))).toBe("smb:/Music");
  });
});

describe("smbPathOf", () => {
  it("recovers the share-relative path", () => {
    expect(smbPathOf("smb:/Music/a.flac")).toBe("/Music/a.flac");
    expect(smbPathOf("smb:/")).toBe("/");
  });

  it("refuses another source's address", () => {
    expect(smbPathOf("webdav:/Music/a.flac")).toBeNull();
    expect(smbPathOf("file:///storage/a.flac")).toBeNull();
  });
});

// Addresses are hex-encoded into track ids, which travel through the queue store,
// MMKV, widget payloads and Android Auto media ids. A round trip that loses the
// scheme would silently point playback at the device filesystem.
describe("track id round trip", () => {
  it.each([
    "smb:/Music/a.flac",
    "smb:/Musique/Été/01 - Café.mp3",
    "smb:/Music/100% real [feat. x].m4a",
  ])("survives encoding %s", (address) => {
    expect(parseLocalTrackId(localTrackId(address))).toBe(address);
  });
});
