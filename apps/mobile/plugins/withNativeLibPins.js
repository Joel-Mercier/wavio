const { withAppBuildGradle } = require("expo/config-plugins");

// Compose (pulled in by react-native-pager-view) still requires graphics-path
// 1.0.1, whose libandroidx.graphics.path.so is built with NDK r25c and fails
// the 16 KB page-size RELRO check that Play flags. 1.1.0 is built with r27.
const PINS = ["androidx.graphics:graphics-path:1.1.0"];

const withNativeLibPins = (config) =>
  withAppBuildGradle(config, (cfg) => {
    const missing = PINS.filter(
      (pin) => !cfg.modResults.contents.includes(`'${pin}'`),
    );
    if (missing.length === 0) {
      return cfg;
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /dependencies\s*\{/,
      (match) =>
        `${match}\n${missing.map((pin) => `    implementation '${pin}'`).join("\n")}`,
    );
    return cfg;
  });

module.exports = withNativeLibPins;
