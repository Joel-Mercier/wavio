const { withAndroidManifest } = require("expo/config-plugins");

const PERMISSION = "android.permission.REQUEST_INSTALL_PACKAGES";

// The GitHub-distributed APK self-installs updates (download APK → launch the
// system package installer), which needs REQUEST_INSTALL_PACKAGES. Store builds
// update through Google Play's in-app-update flow instead, so they must NOT
// declare this permission — shipping a self-install permission in the Play AAB
// invites review friction. The permission is therefore added only when this
// build is not a store build (EXPO_PUBLIC_DISTRIBUTION !== "store").
const withInstallApkPermission = (config) =>
  withAndroidManifest(config, (cfg) => {
    if (process.env.EXPO_PUBLIC_DISTRIBUTION === "store") {
      return cfg;
    }
    const manifest = cfg.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] || [];
    const already = manifest["uses-permission"].some(
      (entry) => entry?.$?.["android:name"] === PERMISSION,
    );
    if (!already) {
      manifest["uses-permission"].push({ $: { "android:name": PERMISSION } });
    }
    return cfg;
  });

module.exports = withInstallApkPermission;
