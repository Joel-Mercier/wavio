const { withAppBuildGradle } = require("expo/config-plugins");

const DEPENDENCIES_INFO_BLOCK = `    dependenciesInfo {
        // Disables dependency metadata when building APKs (required for reproducible F-Droid/IzzyOnDroid builds).
        includeInApk = false
        // Disables dependency metadata when building Android App Bundles.
        includeInBundle = false
    }
`;

const withDependenciesInfo = (config) =>
  withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error(
        "withDependenciesInfo only supports Groovy build.gradle files",
      );
    }
    if (config.modResults.contents.includes("dependenciesInfo {")) {
      return config;
    }
    config.modResults.contents = config.modResults.contents.replace(
      /android\s*{/,
      (match) => `${match}\n${DEPENDENCIES_INFO_BLOCK}`,
    );
    return config;
  });

module.exports = withDependenciesInfo;
