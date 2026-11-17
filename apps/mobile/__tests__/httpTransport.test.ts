jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: {
      setItem: (k: string, v: string) => mem.set(k, v),
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    },
  };
});

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { changeLanguage: jest.fn() },
  applyZodLocale: jest.fn(),
}));

const mockAvailable = jest.fn(() => true);
const mockSetHttp3Enabled = jest.fn();
const mockGetEngineState = jest.fn();
const mockGetHostTransport = jest.fn();
jest.mock("@/modules/http-stack", () => ({
  isHttpStackAvailable: () => mockAvailable(),
  setHttp3Enabled: (enabled: boolean) => mockSetHttp3Enabled(enabled),
  getEngineState: () => mockGetEngineState(),
  getHostTransport: (host: string) => mockGetHostTransport(host),
}));

import { http3StatusForUrl, initHttpTransport } from "@/services/httpTransport";
import { useAppBase } from "@/stores/app";

const host = (
  protocol: string | null,
  blocker: "custom-tls" | "tls-fallback" | null = null,
) => ({ protocol, blocker });

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockReturnValue(true);
  useAppBase.setState({ http3Enabled: false });
});

describe("http3Enabled setting", () => {
  it("defaults to off", () => {
    expect(useAppBase.getInitialState().http3Enabled).toBe(false);
  });

  it("is set through its setter", () => {
    useAppBase.getState().setHttp3Enabled(true);
    expect(useAppBase.getState().http3Enabled).toBe(true);
  });
});

describe("initHttpTransport", () => {
  it("pushes the current value once, then only on change", () => {
    useAppBase.setState({ http3Enabled: true });
    const unsubscribe = initHttpTransport();
    expect(mockSetHttp3Enabled).toHaveBeenCalledTimes(1);
    expect(mockSetHttp3Enabled).toHaveBeenLastCalledWith(true);

    useAppBase.setState({ downloadsWifiOnly: true });
    expect(mockSetHttp3Enabled).toHaveBeenCalledTimes(1);

    useAppBase.getState().setHttp3Enabled(false);
    expect(mockSetHttp3Enabled).toHaveBeenCalledTimes(2);
    expect(mockSetHttp3Enabled).toHaveBeenLastCalledWith(false);

    unsubscribe();
    useAppBase.getState().setHttp3Enabled(true);
    expect(mockSetHttp3Enabled).toHaveBeenCalledTimes(2);
  });

  it("does nothing without the native module", () => {
    mockAvailable.mockReturnValue(false);
    const unsubscribe = initHttpTransport();
    useAppBase.getState().setHttp3Enabled(true);
    unsubscribe();
    expect(mockSetHttp3Enabled).not.toHaveBeenCalled();
  });
});

describe("http3StatusForUrl", () => {
  it("is active when the host's last response came over HTTP/3", () => {
    mockGetEngineState.mockReturnValue("ready");
    mockGetHostTransport.mockReturnValue(host("h3"));
    expect(http3StatusForUrl("https://Music.Example.com:8443/rest")).toBe(
      "active",
    );
    expect(mockGetHostTransport).toHaveBeenCalledWith("music.example.com");
  });

  it("is inactive when the host answered over HTTP/2", () => {
    mockGetEngineState.mockReturnValue("ready");
    mockGetHostTransport.mockReturnValue(host("h2"));
    expect(http3StatusForUrl("https://music.example.com")).toBe("inactive");
  });

  it("reports nothing before the host has answered since HTTP/3 was on", () => {
    mockGetEngineState.mockReturnValue("ready");
    mockGetHostTransport.mockReturnValue(host(null));
    expect(http3StatusForUrl("https://music.example.com")).toBeNull();
  });

  it("reports nothing while the engine is still starting", () => {
    mockGetEngineState.mockReturnValue("starting");
    mockGetHostTransport.mockReturnValue(host("h2"));
    expect(http3StatusForUrl("https://music.example.com")).toBeNull();
  });

  it("explains an http:// server instead of asking for a proxy", () => {
    mockGetEngineState.mockReturnValue("ready");
    mockGetHostTransport.mockReturnValue(host("http/1.1"));
    expect(http3StatusForUrl("HTTP://192.168.1.10:4533")).toBe("cleartext");
  });

  it("explains a host kept on OkHttp for its custom TLS", () => {
    mockGetEngineState.mockReturnValue("starting");
    mockGetHostTransport.mockReturnValue(host("h2", "custom-tls"));
    expect(http3StatusForUrl("https://music.lan")).toBe("customTls");
  });

  it("explains a host sent back to OkHttp after a TLS failure", () => {
    mockGetEngineState.mockReturnValue("ready");
    mockGetHostTransport.mockReturnValue(host("h2", "tls-fallback"));
    expect(http3StatusForUrl("https://music.example.com")).toBe("tlsFallback");
  });

  it("is unavailable when the engine couldn't be built", () => {
    mockGetEngineState.mockReturnValue("failed");
    mockGetHostTransport.mockReturnValue(host(null, "custom-tls"));
    expect(http3StatusForUrl("http://music.example.com")).toBe("unavailable");
  });

  it("is unavailable without the native module", () => {
    mockGetEngineState.mockReturnValue(null);
    expect(http3StatusForUrl("https://music.example.com")).toBe("unavailable");
  });
});
