const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withGradleProperties,
} = require("expo/config-plugins");

// Wires the Wear OS companion (apps/mobile/wear) into the generated Android
// project. The watch sources deliberately live *outside* android/ so prebuild
// never touches them; only the few lines that make gradle aware of them are
// injected here.
//
// Everything the watch module itself needs — the Compose compiler plugin, its
// version code and name — is resolved inside wear/build.gradle at configuration
// time, where the values are actually known. Nothing is stamped from here.

const SETTINGS_MARKER = "// wavio: wear os companion";
const SETTINGS_BLOCK = `
${SETTINGS_MARKER}
include ':wear'
project(':wear').projectDir = new File(rootDir, '../wear')
`;

// Adds ':wear' to settings.gradle, pointing at apps/mobile/wear. There is no
// withSettingsGradle mod that survives Expo's own regeneration of the file, so
// this appends after prebuild has written it.
const withWearSettingsGradle = (config) =>
  withDangerousMod(config, [
    "android",
    (cfg) => {
      const settings = path.join(
        cfg.modRequest.platformProjectRoot,
        "settings.gradle",
      );
      let contents = fs.readFileSync(settings, "utf8");
      if (!contents.includes(SETTINGS_MARKER)) {
        contents = `${contents.trimEnd()}\n${SETTINGS_BLOCK}`;
        fs.writeFileSync(settings, contents);
      }
      return cfg;
    },
  ]);

// A second application module plus the Compose compiler does not fit in the
// 2GB heap the Expo template ships with.
const WEAR_JVM_ARGS = "-Xmx4096m -XX:MaxMetaspaceSize=1024m";

const withWearGradleProperties = (config) =>
  withGradleProperties(config, (cfg) => {
    const existing = cfg.modResults.find(
      (item) => item.type === "property" && item.key === "org.gradle.jvmargs",
    );
    if (existing) {
      existing.value = WEAR_JVM_ARGS;
    } else {
      cfg.modResults.push({
        type: "property",
        key: "org.gradle.jvmargs",
        value: WEAR_JVM_ARGS,
      });
    }
    return cfg;
  });

module.exports = (config) => {
  config = withWearSettingsGradle(config);
  config = withWearGradleProperties(config);
  return config;
};
