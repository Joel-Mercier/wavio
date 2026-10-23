// Discovery fetches through the bare probe client; replace it with a URL-keyed
// table of canned responses.
type Canned = {
  status: number;
  data?: unknown;
  headers?: Record<string, string>;
};
let mockResponses: Record<string, Canned> = {};
const mockRequested: string[] = [];
jest.mock("@/services/backend/probe", () => ({
  createBareClient: (baseURL: string) => ({
    get: async () => {
      mockRequested.push(baseURL);
      const canned = mockResponses[baseURL];
      if (!canned) return { status: 404, data: "", headers: {} };
      return { headers: {}, ...canned };
    },
  }),
}));

import {
  discoverAuthorizationServer,
  discoverProtectedResource,
  normalizeResource,
  OidcDiscoveryError,
  protectedResourceMetadataUrl,
  requestScopes,
  resourceMetadataFromChallenge,
} from "@/services/oidc/discovery";

const ISSUER = "https://auth.example.com/realms/home";
const ISSUER_METADATA = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  revocation_endpoint: `${ISSUER}/protocol/openid-connect/revoke`,
  scopes_supported: ["openid", "profile", "offline_access"],
  code_challenge_methods_supported: ["plain", "S256"],
};

beforeEach(() => {
  mockResponses = {};
  mockRequested.length = 0;
});

describe("RFC 9728 well-known URL", () => {
  it("inserts the suffix between the host and the path", () => {
    expect(protectedResourceMetadataUrl("https://music.example.com")).toBe(
      "https://music.example.com/.well-known/oauth-protected-resource",
    );
    expect(protectedResourceMetadataUrl("https://music.example.com/")).toBe(
      "https://music.example.com/.well-known/oauth-protected-resource",
    );
    expect(protectedResourceMetadataUrl("https://example.com/navidrome")).toBe(
      "https://example.com/.well-known/oauth-protected-resource/navidrome",
    );
  });

  it("normalizes only scheme/host case and a trailing slash", () => {
    expect(normalizeResource("HTTPS://Music.Example.com/")).toBe(
      "https://music.example.com",
    );
    expect(normalizeResource("https://example.com/ND/")).toBe(
      "https://example.com/ND",
    );
  });

  it("reads resource_metadata from a Bearer challenge", () => {
    expect(
      resourceMetadataFromChallenge(
        'Bearer realm="music", resource_metadata="https://music.example.com/.well-known/oauth-protected-resource"',
      ),
    ).toBe("https://music.example.com/.well-known/oauth-protected-resource");
    expect(resourceMetadataFromChallenge('Basic realm="x"')).toBeNull();
  });
});

describe("discoverProtectedResource", () => {
  it("returns the metadata the proxy publishes for this URL", async () => {
    mockResponses[
      "https://music.example.com/.well-known/oauth-protected-resource"
    ] = {
      status: 200,
      data: {
        resource: "https://music.example.com",
        authorization_servers: [ISSUER],
      },
    };
    await expect(
      discoverProtectedResource("https://music.example.com/"),
    ).resolves.toEqual({
      resource: "https://music.example.com",
      authorizationServers: [ISSUER],
      scopes: [],
    });
  });

  // RFC 9728 §7.3: metadata describing some other resource must be discarded,
  // or a lookalike could steer the sign-in to its own IdP.
  it("rejects metadata whose resource is a different URL", async () => {
    mockResponses[
      "https://music.example.com/.well-known/oauth-protected-resource"
    ] = {
      status: 200,
      data: {
        resource: "https://evil.example.net",
        authorization_servers: ["https://evil.example.net/auth"],
      },
    };
    await expect(
      discoverProtectedResource("https://music.example.com"),
    ).resolves.toBeNull();
  });

  it("follows a 401 challenge when the well-known path is missing", async () => {
    mockResponses["https://music.example.com/rest/ping"] = {
      status: 401,
      headers: {
        "www-authenticate":
          'Bearer resource_metadata="https://music.example.com/meta.json"',
      },
    };
    mockResponses["https://music.example.com/meta.json"] = {
      status: 200,
      data: {
        resource: "https://music.example.com",
        authorization_servers: [ISSUER],
        scopes_supported: ["music"],
      },
    };
    const found = await discoverProtectedResource("https://music.example.com");
    expect(found?.scopes).toEqual(["music"]);
  });

  it("is null for a server that isn't behind SSO", async () => {
    mockResponses["https://music.example.com/rest/ping"] = {
      status: 200,
      data: { "subsonic-response": { status: "failed" } },
    };
    await expect(
      discoverProtectedResource("https://music.example.com"),
    ).resolves.toBeNull();
  });
});

describe("discoverAuthorizationServer", () => {
  it("reads OpenID Connect discovery", async () => {
    mockResponses[`${ISSUER}/.well-known/openid-configuration`] = {
      status: 200,
      data: ISSUER_METADATA,
    };
    const server = await discoverAuthorizationServer(ISSUER);
    expect(server.tokenEndpoint).toBe(ISSUER_METADATA.token_endpoint);
    expect(server.revocationEndpoint).toBe(ISSUER_METADATA.revocation_endpoint);
  });

  it("tolerates a trailing-slash issuer (Authentik)", async () => {
    const authentik = "https://sso.example.com/application/o/wavio/";
    mockResponses[
      "https://sso.example.com/application/o/wavio/.well-known/openid-configuration"
    ] = {
      status: 200,
      data: { ...ISSUER_METADATA, issuer: authentik },
    };
    const server = await discoverAuthorizationServer(authentik);
    expect(server.issuer).toBe(authentik);
  });

  it("falls back to RFC 8414 metadata, path-inserted", async () => {
    mockResponses[
      "https://auth.example.com/.well-known/oauth-authorization-server/realms/home"
    ] = { status: 200, data: ISSUER_METADATA };
    const server = await discoverAuthorizationServer(ISSUER);
    expect(server.authorizationEndpoint).toBe(
      ISSUER_METADATA.authorization_endpoint,
    );
  });

  // RFC 8414 §3.3 mix-up defence.
  it("refuses metadata that describes another issuer", async () => {
    mockResponses[`${ISSUER}/.well-known/openid-configuration`] = {
      status: 200,
      data: { ...ISSUER_METADATA, issuer: "https://other.example.com" },
    };
    await expect(discoverAuthorizationServer(ISSUER)).rejects.toBeInstanceOf(
      OidcDiscoveryError,
    );
  });

  it("refuses a server that can't do PKCE S256", async () => {
    mockResponses[`${ISSUER}/.well-known/openid-configuration`] = {
      status: 200,
      data: { ...ISSUER_METADATA, code_challenge_methods_supported: ["plain"] },
    };
    await expect(discoverAuthorizationServer(ISSUER)).rejects.toThrow("S256");
  });
});

describe("requestScopes", () => {
  it("asks for a refresh token plus what the proxy needs", () => {
    expect(requestScopes(["music"], undefined)).toEqual([
      "openid",
      "profile",
      "offline_access",
      "music",
    ]);
  });

  it("drops offline_access where the server doesn't offer it", () => {
    expect(requestScopes([], ["openid", "profile"])).toEqual([
      "openid",
      "profile",
    ]);
  });
});
