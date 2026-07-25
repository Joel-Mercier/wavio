const { withAndroidManifest } = require("expo/config-plugins");

const PERMISSION = "android.permission.REQUEST_INSTALL_PACKAGES";

// The GitHub-distributed APK self-installs updates (download APK → launch the
// system package installer), which needs REQUEST_INSTALL_PACKAGES. Store builds
// update through Google Play's in-app-update flow instead, so they must NOT
// declare this permission — it's a Play restricted permission whose eligible use
// cases (app stores, file managers, backup/restore) don't cover a music client,
// so shipping it in the AAB means a rejection.
//
// Both branches write, never skip: android/ is committed, so a prebuild that
// merely declined to add the permission would leave a previously-generated one
// in place. Store builds therefore strip it explicitly, making the manifest a
// function of EXPO_PUBLIC_DISTRIBUTION alone rather than of build order.
const withInstallApkPermission = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const permissions = manifest["uses-permission"] || [];
    const isStore = process.env.EXPO_PUBLIC_DISTRIBUTION === "store";

    manifest["uses-permission"] = permissions.filter(
      (entry) => entry?.$?.["android:name"] !== PERMISSION,
    );
    if (!isStore) {
      manifest["uses-permission"].push({ $: { "android:name": PERMISSION } });
    }
    return cfg;
  });

module.exports = withInstallApkPermission;
