const { withAndroidManifest } = require("expo/config-plugins");

// Preview builds are the release-mode builds we profile on device (simpleperf,
// perfetto callstacks), which needs <profileable android:shell="true"/>.
// Production must not ship it. android/ is reused across prebuilds, so the
// other variants strip the tag explicitly rather than just not adding it.
const withProfileable = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg;
    delete application.profileable;
    if (process.env.APP_VARIANT === "preview") {
      application.profileable = [{ $: { "android:shell": "true" } }];
    }
    return cfg;
  });

module.exports = withProfileable;
