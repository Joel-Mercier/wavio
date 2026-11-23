const {
  withAppBuildGradle,
  withSettingsGradle,
} = require("expo/config-plugins");

// The Play Store build carries no part of release notifications: Play owns its
// updates. app.config.js already leaves out googleServicesFile there; this keeps
// the module itself (and with it firebase-messaging, Play services and the FCM
// service) out of autolinking, and drops the Google Services Gradle plugin.
//
// Both branches write, as in withInstallApkPermission: android/ is reused
// across prebuilds, and Expo only ever adds the Google Services plugin line, so
// a store prebuild after a GitHub one would otherwise keep Firebase wired in.
const MODULE = "release-push";
const EXCLUDE_LINE = `expoAutolinking.exclude = ["${MODULE}"]`;
const USE_EXPO_MODULES = "expoAutolinking.useExpoModules()";
const GOOGLE_SERVICES_APPLY =
  /^\s*apply\s+plugin:\s*['"]com\.google\.gms\.google-services['"]\s*$/gm;

const isStore = () => process.env.EXPO_PUBLIC_DISTRIBUTION === "store";

const withReleasePush = (config) => {
  config = withSettingsGradle(config, (cfg) => {
    let contents = cfg.modResults.contents
      .split("\n")
      .filter((line) => line.trim() !== EXCLUDE_LINE)
      .join("\n");
    if (isStore()) {
      if (!contents.includes(USE_EXPO_MODULES)) {
        throw new Error(
          `withReleasePush: "${USE_EXPO_MODULES}" not found in settings.gradle`,
        );
      }
      contents = contents.replace(
        USE_EXPO_MODULES,
        `${EXCLUDE_LINE}\n${USE_EXPO_MODULES}`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
  return withAppBuildGradle(config, (cfg) => {
    if (isStore()) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        GOOGLE_SERVICES_APPLY,
        "",
      );
    }
    return cfg;
  });
};

module.exports = withReleasePush;
