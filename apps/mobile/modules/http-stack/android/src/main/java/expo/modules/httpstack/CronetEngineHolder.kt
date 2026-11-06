package expo.modules.httpstack

import android.content.Context
import android.util.Log
import androidx.annotation.OptIn
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.net.CronetProviderInstaller
import java.io.File
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import org.chromium.net.ConnectionMigrationOptions
import org.chromium.net.CronetEngine
import org.chromium.net.CronetProvider

/**
 * Builds the one Cronet engine, off the main thread, from the platform
 * HttpEngine or else Play Services Cronet. Any failure leaves [lease] null and
 * every request on OkHttp. Never the fallback (HttpURLConnection-backed, no
 * HTTP/2 or 3) or an embedded provider.
 */
internal object CronetEngineHolder {
  private const val TAG = HttpStack.TAG
  private const val CACHE_BYTES = 1L shl 20

  enum class State(val wire: String) {
    IDLE("idle"),
    BUILDING("starting"),
    INSTALLING_PROVIDER("starting"),
    READY("ready"),
    FAILED("failed"),
  }

  // At most one thread, gone 10 s after the last task.
  private val executor = ThreadPoolExecutor(
    0, 1, 10, TimeUnit.SECONDS, LinkedBlockingQueue(),
  ) { r -> Thread(r, "http-stack-cronet") }

  @Volatile var lease: CronetLease? = null
    private set
  @Volatile var state: State = State.IDLE
    private set
  private var playServicesRequested = false

  /**
   * Starts a build unless one is ready or under way. A failed build is only
   * retried when [retryFailed], so building clients doesn't rebuild it each time.
   */
  fun warmUp(context: Context, retryFailed: Boolean) {
    if (!Http3Settings.isEnabled()) return
    synchronized(this) {
      when (state) {
        State.BUILDING, State.INSTALLING_PROVIDER, State.READY -> return
        State.FAILED -> if (!retryFailed) return
        State.IDLE -> Unit
      }
      moveTo(State.BUILDING)
    }
    val app = context.applicationContext
    executor.execute { build(app) }
  }

  private fun build(context: Context) {
    try {
      val provider = pickProvider(context)
      if (provider == null) {
        requestPlayServicesProvider(context)
        return
      }
      val builder = provider.createBuilder()
        .enableQuic(true)
        .enableHttp2(true)
        .enableBrotli(true)
        .setStoragePath(storageDir(context))
        // Persists QUIC server info / Alt-Svc between launches, no HTTP bodies.
        .enableHttpCache(CronetEngine.Builder.HTTP_CACHE_DISK_NO_HTTP, CACHE_BYTES)
        .setUserAgent(userAgent(context))
      configureMigration(builder)
      lease = CronetLease(builder.build())
      Log.i(TAG, "cronet engine ready: ${provider.name} ${provider.version}")
      synchronized(this) { moveTo(State.READY) }
    } catch (t: Throwable) {
      fail("cronet engine build failed; staying on OkHttp", t)
    }
  }

  private fun pickProvider(context: Context): CronetProvider? {
    val all = CronetProvider.getAllProviders(context)
    all.forEach { Log.i(TAG, "provider ${it.name} ${it.version} enabled=${it.isEnabled}") }
    return all.firstOrNull {
      it.isEnabled && it.name == CronetProvider.PROVIDER_NAME_HTTPENGINE_NATIVE
    } ?: all.firstOrNull {
      it.isEnabled && it.name == CronetProviderInstaller.PROVIDER_NAME
    }
  }

  private fun requestPlayServicesProvider(context: Context) {
    synchronized(this) {
      if (playServicesRequested) {
        fail("no Cronet provider; staying on OkHttp")
        return
      }
      playServicesRequested = true
    }
    val gms = try {
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
    } catch (t: Throwable) {
      ConnectionResult.SERVICE_MISSING
    }
    if (gms != ConnectionResult.SUCCESS) {
      fail("no platform HttpEngine and no Play Services ($gms); staying on OkHttp")
      return
    }
    synchronized(this) { moveTo(State.INSTALLING_PROVIDER) }
    CronetProviderInstaller.installProvider(context).addOnCompleteListener { task ->
      if (task.isSuccessful) {
        synchronized(this) { moveTo(State.IDLE) }
        warmUp(context, retryFailed = false)
      } else {
        fail("Play Services Cronet install failed", task.exception)
      }
    }
  }

  private fun fail(message: String, t: Throwable? = null) {
    Log.w(TAG, message, t)
    synchronized(this) { moveTo(State.FAILED) }
  }

  private fun moveTo(next: State) {
    if (state == next) return
    state = next
    HttpStack.notifyChanged()
  }

  @OptIn(markerClass = [ConnectionMigrationOptions.Experimental::class])
  private fun configureMigration(builder: CronetEngine.Builder) {
    try {
      builder.setConnectionMigrationOptions(
        ConnectionMigrationOptions.builder()
          .enableDefaultNetworkMigration(true)
          .enablePathDegradationMigration(true)
          .allowNonDefaultNetworkUsage(false)
          .build(),
      )
      Log.i(TAG, "connection migration enabled")
    } catch (t: Throwable) {
      Log.i(TAG, "connection migration unsupported by provider: $t")
    }
  }

  private fun storageDir(context: Context): String =
    File(context.noBackupFilesDir, "cronet").apply { mkdirs() }.absolutePath

  private fun userAgent(context: Context): String {
    val version = try {
      context.packageManager.getPackageInfo(context.packageName, 0).versionName
    } catch (_: Exception) {
      null
    }
    return "Wavio/${version ?: "1.0.0"}"
  }
}
