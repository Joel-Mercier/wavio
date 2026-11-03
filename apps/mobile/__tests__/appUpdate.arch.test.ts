import type { GithubReleaseAsset } from "@/services/appUpdate/types";

const mockDevice: {
  __esModule: true;
  supportedCpuArchitectures: string[] | null;
} = {
  __esModule: true,
  supportedCpuArchitectures: null,
};

jest.mock("expo-device", () => mockDevice);

const { pickApkAsset } = require("@/services/appUpdate/arch") as {
  pickApkAsset: typeof import("@/services/appUpdate/arch").pickApkAsset;
};

const asset = (name: string): GithubReleaseAsset => ({
  name,
  size: 1,
  browser_download_url: `https://example.com/${name}`,
  content_type: "application/vnd.android.package-archive",
});

const release = [
  asset("wavio-1.5.0-arm64-v8a.apk"),
  asset("wavio-1.5.0-armeabi-v7a.apk"),
  asset("wavio-1.5.0-x86_64.apk"),
  asset("wavio-1.5.0-x86_64.apk.sha256"),
];

describe("appUpdate/arch pickApkAsset", () => {
  it("gives a 64-bit ARM device the arm64 build", () => {
    mockDevice.supportedCpuArchitectures = [
      "arm64-v8a",
      "armeabi-v7a",
      "armeabi",
    ];
    expect(pickApkAsset(release)?.name).toBe("wavio-1.5.0-arm64-v8a.apk");
  });

  it("gives a 32-bit ARM device the armv7 build", () => {
    mockDevice.supportedCpuArchitectures = ["armeabi-v7a", "armeabi"];
    expect(pickApkAsset(release)?.name).toBe("wavio-1.5.0-armeabi-v7a.apk");
  });

  it("gives an x86_64 device with ARM translation the native x86_64 build", () => {
    mockDevice.supportedCpuArchitectures = [
      "x86_64",
      "x86",
      "arm64-v8a",
      "armeabi-v7a",
    ];
    expect(pickApkAsset(release)?.name).toBe("wavio-1.5.0-x86_64.apk");
  });

  it("falls back to an ARM build on x86_64 when the release has no x86_64 APK", () => {
    mockDevice.supportedCpuArchitectures = [
      "x86_64",
      "x86",
      "arm64-v8a",
      "armeabi-v7a",
    ];
    expect(pickApkAsset(release.slice(0, 2))?.name).toBe(
      "wavio-1.5.0-arm64-v8a.apk",
    );
  });

  it("returns null for a 32-bit x86 device", () => {
    mockDevice.supportedCpuArchitectures = ["x86"];
    expect(pickApkAsset(release)).toBeNull();
  });
});
