package expo.modules.ssltrust

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/**
 * Installs the custom trust manager + OkHttp factory during `Application.onCreate`,
 * before React Native constructs its `NetworkingModule`.
 *
 * `NetworkingModule` captures a single `OkHttpClient` in its constructor (from
 * `OkHttpClientProvider`) and reuses it for every request, so the factory must be
 * registered *before* the RN bridge starts. Installing only from the JS
 * `initTrustStore()` call (root `_layout.tsx`) runs too late — the client RN's
 * networking (axios) uses is already built without our trust manager, so a cert
 * trusted at runtime never enters that client's request path and self-signed
 * handshakes keep failing. `AppTrustManager` reads the live trust store on every
 * handshake, so a cert trusted later applies to the same client with no rebuild.
 *
 * Auto-discovered by Expo autolinking: the file ends in `Package.kt` and imports
 * `expo.modules.core.interfaces.Package`, so no `expo-module.config.json` /
 * `android/` change is needed (re-run prebuild to regenerate the package list).
 */
class SslTrustPackage : Package {
  override fun createApplicationLifecycleListeners(
    context: Context,
  ): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        // init() catches its own JSSE failures (surfaced via getInstallStatus),
        // so a failure here is non-fatal to app startup.
        SslTrustStore.init(application)
      }
    })
}
