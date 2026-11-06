package expo.modules.httpstack

import android.app.Application
import android.content.Context
import android.util.Log
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient
import okhttp3.Request

/** TLS configuration a module lends to every client the stack builds. */
interface TlsContributor {
  val sslSocketFactory: SSLSocketFactory
  val trustManager: X509TrustManager
  val hostnameVerifier: HostnameVerifier
}

/** Keeps matching requests on OkHttp (e.g. hosts whose TLS Cronet can't do). */
fun interface TransportVeto {
  fun mustUseOkHttp(request: Request): Boolean
}

/**
 * Owner of React Native's single `OkHttpClientProvider` factory slot. Every
 * client RN, expo-image, expo/fetch, and the patched expo-audio and
 * expo-file-system build goes through [HttpStackFactory], so registrations here
 * reach all of them.
 *
 * Register from `Application.onCreate` (an `ApplicationLifecycleListener`):
 * `NetworkingModule` captures its client in its constructor when the React host
 * starts, and a client built before a registration never sees it.
 */
object HttpStack {
  internal const val TAG = "HttpStack"

  @Volatile private var application: Application? = null
  @Volatile internal var tls: TlsContributor? = null
    private set
  internal val vetoes = ConcurrentHashMap<String, TransportVeto>()
  private val clientsBuilt = AtomicInteger()
  @Volatile private var changeListener: (() -> Unit)? = null

  @Synchronized
  fun install(application: Application) {
    if (this.application != null) return
    Http3Settings.init(application)
    OkHttpClientProvider.setOkHttpClientFactory(HttpStackFactory)
    clearCachedClient()
    this.application = application
    Log.i(TAG, "installed (http3=${Http3Settings.isEnabled()})")
  }

  @Synchronized
  fun registerTls(contributor: TlsContributor) {
    if (tls != null && tls !== contributor) Log.w(TAG, "TLS contributor replaced")
    tls = contributor
    if (clientsBuilt.get() > 0) {
      Log.w(TAG, "TLS registered after ${clientsBuilt.get()} client(s) were built")
      clearCachedClient()
    }
  }

  fun addTransportVeto(key: String, veto: TransportVeto) {
    vetoes[key] = veto
  }

  /** Forget hosts sent back to OkHttp after a Cronet TLS failure. */
  fun clearPinnedHosts() = TransportPolicy.clearPinned()

  internal fun setHttp3Enabled(context: Context, enabled: Boolean) {
    Http3Settings.init(context)
    if (Http3Settings.setEnabled(enabled)) {
      TransportStats.clear()
      notifyChanged()
    }
    if (enabled) CronetEngineHolder.warmUp(context, retryFailed = true)
  }

  @Synchronized
  internal fun setChangeListener(listener: () -> Unit) {
    changeListener = listener
  }

  @Synchronized
  internal fun clearChangeListener(listener: () -> Unit) {
    if (changeListener === listener) changeListener = null
  }

  internal fun notifyChanged() {
    changeListener?.invoke()
  }

  /**
   * The engine is built with the first client rather than at install, so a
   * process that never makes a request (a widget broadcast, a backup run that
   * skips JS) never loads Cronet.
   */
  internal fun onClientBuilt() {
    clientsBuilt.incrementAndGet()
    application?.let { CronetEngineHolder.warmUp(it, retryFailed = false) }
  }

  /**
   * Null the cached client in `OkHttpClientProvider` so the next
   * `getOkHttpClient()` builds through the current registrations. `client` is an
   * `internal` property of a Kotlin `object`; the field was `sClient` in older
   * (Java) RN. Best-effort.
   */
  private fun clearCachedClient() {
    val providerClass = OkHttpClientProvider::class.java
    val instance = try {
      providerClass.getDeclaredField("INSTANCE").get(null)
    } catch (_: Exception) {
      null
    }
    for (name in listOf("client", "sClient")) {
      try {
        val field = providerClass.getDeclaredField(name)
        field.isAccessible = true
        field.set(instance, null)
        return
      } catch (_: Exception) {
      }
    }
  }
}

internal object HttpStackFactory : OkHttpClientFactory {
  override fun createNewNetworkModuleClient(): OkHttpClient {
    // RN's own builder carries the ReactCookieJarContainer NetworkingModule casts
    // to, and createClientBuilder() doesn't consult the factory (no recursion).
    val builder = OkHttpClientProvider.createClientBuilder()
    val tls = HttpStack.tls
    if (tls != null) {
      builder
        .sslSocketFactory(tls.sslSocketFactory, tls.trustManager)
        .hostnameVerifier(tls.hostnameVerifier)
    }
    builder.addInterceptor(TransportRouter)
    return builder.build().also { HttpStack.onClientBuilt() }
  }
}
