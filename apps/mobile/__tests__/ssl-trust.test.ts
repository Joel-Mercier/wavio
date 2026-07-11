// The ssl-trust module's native bridge is absent under jest; mock `expo` so
// `requireOptionalNativeModule` returns null, and force Platform.OS to "ios" so
// the loopback-proxy URL rewriting path (the only platform-gated logic) runs.
jest.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  __setProxyInfoForTests,
  chooseClientCertificate,
  getClientCertificates,
  hostnameFromUrl,
  isSSLError,
  normalizeBase,
  resolveServerBase,
} from "@/modules/ssl-trust";

afterEach(() => {
  __setProxyInfoForTests(null);
});

describe("isSSLError", () => {
  it("matches TLS / certificate failures", () => {
    for (const msg of [
      "java.security.cert.CertPathValidatorException: Trust anchor for certification path not found",
      "The certificate for this server is invalid",
      "SSLHandshakeException",
      "self-signed certificate",
      "The operation couldn't be completed. (NSURLErrorDomain error -1202.)",
    ]) {
      expect(isSSLError(msg)).toBe(true);
    }
  });

  it("ignores unrelated failures and empty input", () => {
    expect(isSSLError("Network Error")).toBe(false);
    expect(isSSLError("Request timed out")).toBe(false);
    expect(isSSLError("")).toBe(false);
    expect(isSSLError(undefined)).toBe(false);
    expect(isSSLError(null)).toBe(false);
  });
});

describe("normalizeBase", () => {
  it("lowercases scheme+host and drops the path", () => {
    expect(normalizeBase("https://Music.Example.com/rest/ping?x=1")).toBe(
      "https://music.example.com",
    );
  });

  it("keeps an explicit port and trims trailing slashes", () => {
    expect(normalizeBase("https://host.local:4533/")).toBe(
      "https://host.local:4533",
    );
  });

  it("passes through a string without a scheme", () => {
    expect(normalizeBase("Example.com/foo/")).toBe("example.com/foo");
  });
});

describe("hostnameFromUrl", () => {
  it("extracts the lowercased host, dropping scheme, port and path", () => {
    expect(hostnameFromUrl("https://Music.Example.com:4533/rest/ping")).toBe(
      "music.example.com",
    );
    expect(hostnameFromUrl("  http://host.local/foo  ")).toBe("host.local");
  });

  it("returns an empty string when no host can be parsed", () => {
    expect(hostnameFromUrl("not a url")).toBe("");
    expect(hostnameFromUrl("")).toBe("");
  });
});

describe("client-cert wrappers off Android", () => {
  it("no-op gracefully when the native module is unavailable", async () => {
    await expect(chooseClientCertificate("example.com")).resolves.toBeNull();
    await expect(getClientCertificates()).resolves.toEqual([]);
  });
});

describe("resolveServerBase", () => {
  it("returns the URL unchanged when no proxy is running", () => {
    const url = "https://music.example.com/rest/stream?id=1";
    expect(resolveServerBase(url)).toBe(url);
  });

  it("rewrites a trusted upstream to the loopback proxy, preserving the path", () => {
    __setProxyInfoForTests({
      port: 8080,
      upstreams: [{ baseUrl: "https://music.example.com", token: "abc123" }],
    });
    expect(
      resolveServerBase("https://music.example.com/rest/stream?id=42"),
    ).toBe("http://127.0.0.1:8080/abc123/rest/stream?id=42");
  });

  it("leaves a non-trusted host untouched", () => {
    __setProxyInfoForTests({
      port: 8080,
      upstreams: [{ baseUrl: "https://music.example.com", token: "abc123" }],
    });
    const other = "https://other.example.com/rest/stream?id=42";
    expect(resolveServerBase(other)).toBe(other);
  });
});
