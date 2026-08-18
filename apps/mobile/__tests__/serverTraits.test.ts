import {
  filesAreOnDeviceType,
  hasNetworkServerType,
  isIndexBackedType,
  isNetworkShareType,
  isSingletonServerType,
  speaksHttpType,
} from "@/services/backend/serverTraits";
import { type ServerType, serverTypeSchema } from "@/stores/servers";

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

type Traits = {
  indexBacked: boolean;
  filesOnDevice: boolean;
  networkServer: boolean;
  singleton: boolean;
  http: boolean;
};

// Keyed by ServerType, so adding a member to the union is a *compile* error here
// until someone states what the new type's four properties are. That is the
// whole point of this table: the properties came apart when network file shares
// arrived, and the next backend must not be able to inherit a default silently.
const EXPECTED: Record<ServerType, Traits> = {
  navidrome: {
    indexBacked: false,
    filesOnDevice: false,
    networkServer: true,
    singleton: false,
    http: true,
  },
  opensubsonic: {
    indexBacked: false,
    filesOnDevice: false,
    networkServer: true,
    singleton: false,
    http: true,
  },
  jellyfin: {
    indexBacked: false,
    filesOnDevice: false,
    networkServer: true,
    singleton: false,
    http: true,
  },
  local: {
    indexBacked: true,
    filesOnDevice: true,
    networkServer: false,
    singleton: true,
    http: false,
  },
  // The type the split exists for: index-backed like `local`, but remote,
  // credentialed and multi-instance like a media server.
  webdav: {
    indexBacked: true,
    filesOnDevice: false,
    networkServer: true,
    singleton: false,
    http: true,
  },
  // Like `webdav` except for the last one: SMB has a server to reach and
  // authenticate against, but speaks its own wire protocol, so no per-host header
  // or TLS-trust machinery applies to it. Its credentials never leave the native
  // module, and the only HTTP involved is its own loopback bridge.
  smb: {
    indexBacked: true,
    filesOnDevice: false,
    networkServer: true,
    singleton: false,
    http: false,
  },
};

describe("server traits", () => {
  it.each(serverTypeSchema.options)("describes %s", (type) => {
    const expected = EXPECTED[type];
    expect({
      indexBacked: isIndexBackedType(type),
      filesOnDevice: filesAreOnDeviceType(type),
      networkServer: hasNetworkServerType(type),
      singleton: isSingletonServerType(type),
      http: speaksHttpType(type),
    }).toEqual(expected);
  });

  it("covers every member of the ServerType union", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(
      [...serverTypeSchema.options].sort(),
    );
  });

  // Guards the invariant the predicates exist to express: an index-backed library
  // need not have its files on this device. WebDAV and SMB are what break the old
  // coincidence, so this catches anyone reaching for `filesAreOnDeviceType` where
  // `isIndexBackedType` was meant.
  it("keeps index-backed and files-on-device as separate questions", () => {
    for (const type of serverTypeSchema.options) {
      if (filesAreOnDeviceType(type))
        expect(isIndexBackedType(type)).toBe(true);
    }
  });

  // A library with no server to reach also has no host to key headers or TLS
  // trust against. The converse does not hold — SMB has a server and still
  // doesn't speak HTTP.
  it("never claims HTTP for a server-less library", () => {
    for (const type of serverTypeSchema.options) {
      if (!hasNetworkServerType(type)) expect(speaksHttpType(type)).toBe(false);
    }
  });

  it("recognizes exactly the remote index-backed types as network shares", () => {
    const shares = serverTypeSchema.options.filter(isNetworkShareType);
    expect([...shares].sort()).toEqual(["smb", "webdav"]);
  });
});
