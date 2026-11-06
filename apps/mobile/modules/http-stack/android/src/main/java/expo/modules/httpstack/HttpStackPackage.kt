package expo.modules.httpstack

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/**
 * Installs the OkHttp factory during `Application.onCreate`, before React Native
 * constructs its `NetworkingModule`, which captures a single `OkHttpClient` in
 * its constructor and reuses it for every request. Installing from JS would run
 * too late: that client would already exist without our TLS and routing.
 *
 * Auto-discovered by Expo autolinking: the file ends in `Package.kt` and imports
 * `expo.modules.core.interfaces.Package` (re-run prebuild to regenerate the
 * package list).
 */
class HttpStackPackage : Package {
  override fun createApplicationLifecycleListeners(
    context: Context,
  ): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        HttpStack.install(application)
      }
    })
}
