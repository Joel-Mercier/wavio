const fs = require("node:fs");
const path = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

// Replaces react-native-google-cast's OptionsProvider with one that turns the
// Cast SDK's own media session and notification off.
//
// The library's provider leaves both on. While casting, the SDK then runs a
// second MediaSession (`CastMediaSession`) next to the app's media3 one and
// Android hands hardware media buttons to it: it knows nothing of the queue, so
// a headset "next" does nothing and play/pause is swallowed. Its notification
// (rewind/forward, no previous/next) shows up in front of the app's as well.
// The app mirrors the receiver's state into its own session already
// (services/cast.ts), so the SDK's copies are only ever a second opinion.
//
// Registration order matters: config-plugin mods run last-registered-first, and
// the library's manifest mod hardcodes its own class name. This plugin must
// therefore sit *before* "react-native-google-cast" in app.json's `plugins` so
// that it runs after it and its meta-data value is the one left standing.

const PACKAGE = "com.jmercier.wavio";

const packageOf = (config) => config.android?.package ?? PACKAGE;

const forPackage = (source, pkg) =>
  pkg === PACKAGE ? source : source.split(PACKAGE).join(pkg);

const META_PROVIDER_CLASS =
  "com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME";

const KT_OPTIONS_PROVIDER = `package com.jmercier.wavio.cast

import android.content.Context
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.media.CastMediaOptions
import com.google.android.gms.cast.framework.media.ImagePicker
import com.google.android.gms.common.images.WebImage
import com.reactnative.googlecast.GoogleCastOptionsProvider

// The app owns the media session and the notification while casting; the SDK
// keeps only the device picker and its dialog, which still shows the artwork.
class WavioCastOptionsProvider : GoogleCastOptionsProvider() {
  override fun getCastOptions(context: Context): CastOptions {
    val mediaOptions = CastMediaOptions.Builder()
      .setMediaSessionEnabled(false)
      .setNotificationOptions(null)
      .setImagePicker(FirstImagePicker())
      .build()
    return CastOptions.Builder()
      .setReceiverApplicationId(getReceiverApplicationId(context))
      .setCastMediaOptions(mediaOptions)
      .build()
  }

  private class FirstImagePicker : ImagePicker() {
    override fun onPickImage(metadata: MediaMetadata?, type: Int): WebImage? =
      metadata?.images?.firstOrNull()
  }
}
`;

const withOptionsProviderSource = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const pkg = packageOf(cfg);
      const dir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...pkg.split("."),
        "cast",
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "WavioCastOptionsProvider.kt"),
        forPackage(KT_OPTIONS_PROVIDER, pkg),
      );
      return cfg;
    },
  ]);

const withOptionsProviderMetaData = (config) =>
  withAndroidManifest(config, (cfg) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      META_PROVIDER_CLASS,
      `${packageOf(cfg)}.cast.WavioCastOptionsProvider`,
    );
    return cfg;
  });

module.exports = (config) => {
  config = withOptionsProviderSource(config);
  config = withOptionsProviderMetaData(config);
  return config;
};
