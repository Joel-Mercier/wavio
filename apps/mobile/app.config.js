// App variants: dev / preview / production builds installable side by side.
//
// Everything else still lives in app.json — this file only overlays the few
// identity fields that have to differ so Android treats the builds as three
// separate apps. With APP_VARIANT unset (or "production") app.json is returned
// verbatim, so the Play Store build keeps `com.jmercier.wavio` and the name
// "Wavio" exactly as before.
//
// APP_VARIANT is read at prebuild time (see the prebuild:* scripts in
// package.json and the `env` blocks in eas.json), because the identity it
// changes is baked into android/ and ios/, not into the JS bundle.
const VARIANTS = {
  development: {
    suffix: ".dev",
    name: "Wavio Dev",
    scheme: "wavio-dev",
  },
  preview: {
    suffix: ".preview",
    name: "Wavio Preview",
    scheme: "wavio-preview",
  },
};

module.exports = ({ config }) => {
  const variant = VARIANTS[process.env.APP_VARIANT ?? ""];
  if (!variant) return config;

  return {
    ...config,
    name: variant.name,
    // The variant scheme goes first so `expo start` / the dev client address
    // this build unambiguously; "wavio" stays registered because widget and
    // launcher-shortcut deep links hardcode `wavio://` (they target the app by
    // package, so three installed variants never disambiguate against each
    // other). Expo Router derives the path from the URL rather than from a
    // prefix list, so the extra scheme costs nothing at runtime.
    scheme: [variant.scheme, config.scheme],
    android: {
      ...config.android,
      package: `${config.android.package}${variant.suffix}`,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: `${config.ios.bundleIdentifier}${variant.suffix}`,
    },
  };
};
