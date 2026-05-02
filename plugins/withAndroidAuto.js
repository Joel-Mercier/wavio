const fs = require("node:fs");
const path = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

const AUTOMOTIVE_APP_DESC = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
  <uses name="media" />
</automotiveApp>
`;

const withAutomotiveResource = (config) =>
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
        path.join(xmlDir, "automotive_app_desc.xml"),
        AUTOMOTIVE_APP_DESC,
      );
      return cfg;
    },
  ]);

const withAutoMetaData = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    app["meta-data"] = app["meta-data"] ?? [];
    const exists = app["meta-data"].some(
      (m) => m.$["android:name"] === "com.google.android.gms.car.application",
    );
    if (!exists) {
      app["meta-data"].push({
        $: {
          "android:name": "com.google.android.gms.car.application",
          "android:resource": "@xml/automotive_app_desc",
        },
      });
    }
    return cfg;
  });

module.exports = (config) => {
  config = withAutomotiveResource(config);
  config = withAutoMetaData(config);
  return config;
};
