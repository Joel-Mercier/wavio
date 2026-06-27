package expo.modules.ssltrust

import android.content.Context
import android.util.Log
import java.lang.reflect.Proxy
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import org.json.JSONArray
import org.json.JSONObject

/**
 * Per-host trust store + the one-time global install of the custom trust
 * manager. Persists to SharedPreferences (JSON) so trust survives restarts and
 * is readable from the TLS handshake thread before the JS bridge is up.
 *
 * Keyed by host (not per server/user): a certificate is a property of a host,
 * so the same cert presented by different logged-in users is one trust entry.
 */
object SslTrustStore {
  private const val TAG = "SslTrustStore"
  private const val PREFS = "wavio_ssl_trust"
  private const val KEY_ENTRIES = "entries"

  data class TrustedCertEntry(
    val hostname: String,
    val sha256Fingerprint: String,
    val acceptedAt: Long,
    val validTo: String?,
  )

  // host -> entry. ConcurrentHashMap so handshake-thread reads are safe while
  // the JS thread writes.
  private val entries = ConcurrentHashMap<String, TrustedCertEntry>()
  private var prefs: android.content.SharedPreferences? = null

  @Volatile var installed = false
    private set
  @Volatile var installError: String? = null
    private set

  fun init(context: Context) {
    if (prefs == null) {
      prefs = context.applicationContext.getSharedPreferences(
        PREFS, Context.MODE_PRIVATE,
      )
      loadFromPrefs()
    }
    if (!installed) installCustomTrustManager()
  }

  // --- trust queries / mutations --------------------------------------------

  fun isCertificateTrusted(hostname: String): Boolean =
    entries.containsKey(hostname.lowercase())

  fun getTrustedCertificates(): List<Map<String, Any?>> =
    entries.values.map {
      mapOf(
        "hostname" to it.hostname,
        "sha256Fingerprint" to it.sha256Fingerprint,
        "acceptedAt" to it.acceptedAt,
        "validTo" to it.validTo,
      )
    }

  fun trust(hostname: String, sha256Fingerprint: String, validTo: String?) {
    val host = hostname.lowercase()
    entries[host] = TrustedCertEntry(
      host, sha256Fingerprint.uppercase(), System.currentTimeMillis(), validTo,
    )
    persist()
  }

  fun remove(hostname: String) {
    entries.remove(hostname.lowercase())
    persist()
  }

  fun clearAll() {
    entries.clear()
    persist()
  }

  /** Whether any trusted entry matches this exact leaf fingerprint. */
  fun isFingerprintTrusted(fingerprint: String): Boolean =
    entries.values.any { it.sha256Fingerprint.equals(fingerprint, true) }

  fun getFingerprint(cert: X509Certificate): String =
    MessageDigest.getInstance("SHA-256").digest(cert.encoded)
      .joinToString(":") { "%02X".format(it) }

  // --- install ---------------------------------------------------------------

  /**
   * Install the custom trust manager globally:
   *  1. `HttpsURLConnection` defaults — covers ExoPlayer (expo-audio) and Glide
   *     (expo-image), both of which use `HttpsURLConnection`.
   *  2. React Native's `OkHttpClientProvider` factory (reflection) — covers
   *     axios / RN networking. Best-effort; failure here is non-fatal.
   */
  @Synchronized
  fun installCustomTrustManager() {
    if (installed) return
    try {
      val systemTm = resolveSystemTrustManager()
      val appTm = AppTrustManager(systemTm)
      val sslContext = SSLContext.getInstance("TLS")
      sslContext.init(null, arrayOf(appTm), java.security.SecureRandom())
      val socketFactory = sslContext.socketFactory

      HttpsURLConnection.setDefaultSSLSocketFactory(socketFactory)
      HttpsURLConnection.setDefaultHostnameVerifier(
        CustomOkHttpClientFactory.CustomHostnameVerifier(),
      )

      installOkHttpFactory(socketFactory, appTm)

      installed = true
      installError = null
      Log.i(TAG, "custom trust manager installed")
    } catch (e: Exception) {
      installError = e.message ?: e.toString()
      Log.e(TAG, "install failed: ${e.message}", e)
    }
  }

  /** First usable system X509TrustManager, tolerating stripped OEM JSSE. */
  private fun resolveSystemTrustManager(): X509TrustManager {
    for (algorithm in listOf(
      TrustManagerFactory.getDefaultAlgorithm(), "X509", "PKIX",
    )) {
      try {
        val tmf = TrustManagerFactory.getInstance(algorithm)
        tmf.init(null as KeyStore?)
        tmf.trustManagers.filterIsInstance<X509TrustManager>().firstOrNull()
          ?.let { return it }
      } catch (e: Exception) {
        Log.w(TAG, "trust manager algorithm $algorithm failed: ${e.message}")
      }
    }
    throw IllegalStateException("no system X509TrustManager available")
  }

  /**
   * Inject a [CustomOkHttpClientFactory] into RN's OkHttpClientProvider. RN is
   * provided by the host app at runtime, so we reach it via reflection and a
   * dynamic Proxy implementing the (RN-owned) `OkHttpClientFactory` interface.
   */
  private fun installOkHttpFactory(
    socketFactory: SSLSocketFactory,
    trustManager: X509TrustManager,
  ) {
    try {
      val providerClass =
        Class.forName("com.facebook.react.modules.network.OkHttpClientProvider")
      val factoryInterface =
        Class.forName("com.facebook.react.modules.network.OkHttpClientFactory")
      val factory = CustomOkHttpClientFactory(socketFactory, trustManager)
      val proxy = Proxy.newProxyInstance(
        factoryInterface.classLoader,
        arrayOf(factoryInterface),
      ) { _, method, _ ->
        if (method.name == "createNewNetworkModuleClient") {
          factory.createNewNetworkModuleClient()
        } else {
          null
        }
      }
      providerClass
        .getMethod("setOkHttpClientFactory", factoryInterface)
        .invoke(null, proxy)

      // RN caches a singleton client lazily; null it so the next request
      // rebuilds through our factory (no-op if it hasn't been created yet).
      try {
        val field = providerClass.getDeclaredField("sClient")
        field.isAccessible = true
        field.set(null, null)
      } catch (_: Exception) {
        // Field name/visibility varies by RN version; ignore.
      }
    } catch (e: Exception) {
      Log.w(TAG, "OkHttp factory install failed (non-fatal): ${e.message}")
    }
  }

  // --- persistence -----------------------------------------------------------

  private fun loadFromPrefs() {
    val raw = prefs?.getString(KEY_ENTRIES, null) ?: return
    try {
      val arr = JSONArray(raw)
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        val host = o.getString("hostname").lowercase()
        entries[host] = TrustedCertEntry(
          host,
          o.getString("sha256Fingerprint"),
          o.optLong("acceptedAt", System.currentTimeMillis()),
          o.optString("validTo", null),
        )
      }
    } catch (e: Exception) {
      Log.w(TAG, "failed to load trust store: ${e.message}")
    }
  }

  private fun persist() {
    val arr = JSONArray()
    for (e in entries.values) {
      arr.put(
        JSONObject()
          .put("hostname", e.hostname)
          .put("sha256Fingerprint", e.sha256Fingerprint)
          .put("acceptedAt", e.acceptedAt)
          .put("validTo", e.validTo),
      )
    }
    prefs?.edit()?.putString(KEY_ENTRIES, arr.toString())?.apply()
  }
}

/**
 * X509TrustManager that defers to the system, then accepts a connection whose
 * leaf certificate fingerprint is in the trust store. Re-evaluated on every
 * handshake, so a rotated certificate fails until re-trusted.
 */
class AppTrustManager(
  private val system: X509TrustManager,
) : X509TrustManager {
  override fun checkClientTrusted(
    chain: Array<out X509Certificate>?, authType: String?,
  ) = system.checkClientTrusted(chain, authType)

  override fun checkServerTrusted(
    chain: Array<out X509Certificate>?, authType: String?,
  ) {
    try {
      system.checkServerTrusted(chain, authType)
      return
    } catch (e: java.security.cert.CertificateException) {
      val leaf = chain?.firstOrNull() ?: throw e
      val fingerprint = SslTrustStore.getFingerprint(leaf)
      if (!SslTrustStore.isFingerprintTrusted(fingerprint)) throw e
    }
  }

  override fun getAcceptedIssuers(): Array<X509Certificate> =
    system.acceptedIssuers
}
