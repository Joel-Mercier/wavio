const fs = require("node:fs");
const path = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
} = require("expo/config-plugins");

// Trusts both the system CA set and user-installed certificates. The custom
// trust manager (modules/ssl-trust) is what actually accepts TOFU certs at
// runtime; this config keeps cleartext (used by the iOS loopback proxy has no
// effect on Android, but user-CA trust is a sensible companion) working.
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

const withNetworkSecurityConfigFile = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "network_security_config.xml"),
        NETWORK_SECURITY_CONFIG,
      );
      return cfg;
    },
  ]);

const withNetworkSecurityConfigManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    app.$["android:usesCleartextTraffic"] = "true";
    return cfg;
  });

// The iOS loopback reverse proxy (modules/ssl-trust SslTrustProxy) serves
// AVPlayer over http://127.0.0.1, which App Transport Security blocks unless
// local networking is explicitly allowed.
const withLocalNetworking = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.NSAppTransportSecurity = {
      ...(cfg.modResults.NSAppTransportSecurity ?? {}),
      NSAllowsLocalNetworking: true,
    };
    return cfg;
  });

module.exports = (config) => {
  config = withNetworkSecurityConfigFile(config);
  config = withNetworkSecurityConfigManifest(config);
  config = withLocalNetworking(config);
  return config;
};
