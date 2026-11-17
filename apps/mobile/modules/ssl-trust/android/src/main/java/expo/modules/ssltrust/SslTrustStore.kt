package expo.modules.ssltrust

import android.app.Application
import android.content.Context
import android.security.KeyChain
import android.util.Log
import expo.modules.httpstack.HttpStack
import java.net.Socket
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509ExtendedKeyManager
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
  private const val KEY_CLIENT_ALIASES = "client_aliases"

  data class TrustedCertEntry(
    val hostname: String,
    val sha256Fingerprint: String,
    val acceptedAt: Long,
    val validTo: String?,
  )

  // host -> entry. ConcurrentHashMap so handshake-thread reads are safe while
  // the JS thread writes.
  private val entries = ConcurrentHashMap<String, TrustedCertEntry>()
  // host -> Android KeyChain alias for mTLS client-cert auth. Read live on the
  // handshake thread by [MtlsKeyManager]; the private key stays in the OS
  // keystore, only the alias string is persisted here.
  private val clientAliases = ConcurrentHashMap<String, String>()
  private var prefs: android.content.SharedPreferences? = null
  @Volatile private var appContext: Context? = null

  @Volatile var installed = false
    private set
  @Volatile var installError: String? = null
    private set

  fun init(context: Context) {
    appContext = context.applicationContext
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
    HttpStack.clearPinnedHosts()
  }

  fun clearAll() {
    entries.clear()
    persist()
    HttpStack.clearPinnedHosts()
  }

  /** Whether any trusted entry matches this exact leaf fingerprint. */
  fun isFingerprintTrusted(fingerprint: String): Boolean =
    entries.values.any { it.sha256Fingerprint.equals(fingerprint, true) }

  // --- mTLS client certificates ---------------------------------------------

  fun applicationContext(): Context? = appContext

  /** KeyChain alias configured for [host], or null if none / host unknown. */
  fun getClientAlias(host: String?): String? {
    if (host == null) return null
    return clientAliases[host.lowercase()]
  }

  /** Distinct configured aliases, for the KeyManager's `getClientAliases`. */
  fun getConfiguredAliases(): List<String> = clientAliases.values.distinct()

  fun getClientCertificates(): List<Map<String, Any?>> =
    clientAliases.map { mapOf("hostname" to it.key, "alias" to it.value) }

  /**
   * Replace the whole host->alias map (source of truth is the JS servers
   * store). Mirrors the iOS `syncProxyUpstreams` bulk-replace: entries with a
   * blank alias are dropped so a server that clears its cert stops presenting
   * one.
   */
  fun syncClientCertificates(certs: Map<String, String>) {
    clientAliases.clear()
    for ((host, alias) in certs) {
      if (alias.isNotBlank()) clientAliases[host.lowercase()] = alias
    }
    persistClientAliases()
  }

  fun getFingerprint(cert: X509Certificate): String =
    MessageDigest.getInstance("SHA-256").digest(cert.encoded)
      .joinToString(":") { "%02X".format(it) }

  // --- install ---------------------------------------------------------------

  /**
   * Install the custom trust manager globally:
   *  1. `HttpsURLConnection` defaults — covers the remaining HttpURLConnection
   *     users (widget covers, notification artwork).
   *  2. `HttpStack` (modules/http-stack), which owns React Native's OkHttp
   *     factory — covers axios / fetch, ExoPlayer, expo-image and downloads.
   *     Hosts this store trusts or presents a client cert to stay on OkHttp:
   *     Cronet can't use this trust manager or key manager.
   */
  @Synchronized
  fun installCustomTrustManager() {
    if (installed) return
    try {
      val systemTm = resolveSystemTrustManager()
      val appTm = AppTrustManager(systemTm)
      val sslContext = SSLContext.getInstance("TLS")
      // A host-aware KeyManager presents the configured client certificate for
      // mTLS servers (reads `clientAliases` live, so adding a cert later needs
      // no re-init); the null slot used to disable client auth entirely.
      sslContext.init(
        arrayOf(MtlsKeyManager()), arrayOf(appTm), java.security.SecureRandom(),
      )
      val tls = SslTrustTls(sslContext.socketFactory, appTm)

      HttpsURLConnection.setDefaultSSLSocketFactory(tls.sslSocketFactory)
      HttpsURLConnection.setDefaultHostnameVerifier(tls.hostnameVerifier)

      (appContext as? Application)?.let { HttpStack.install(it) }
      HttpStack.registerTls(tls)
      HttpStack.addTransportVeto("ssl-trust") { request ->
        val host = request.url.host
        isCertificateTrusted(host) || getClientAlias(host) != null
      }

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

  // --- persistence -----------------------------------------------------------

  private fun loadFromPrefs() {
    prefs?.getString(KEY_ENTRIES, null)?.let { raw ->
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
    prefs?.getString(KEY_CLIENT_ALIASES, null)?.let { raw ->
      try {
        val o = JSONObject(raw)
        for (host in o.keys()) clientAliases[host.lowercase()] = o.getString(host)
      } catch (e: Exception) {
        Log.w(TAG, "failed to load client aliases: ${e.message}")
      }
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

  private fun persistClientAliases() {
    val o = JSONObject()
    for ((host, alias) in clientAliases) o.put(host, alias)
    prefs?.edit()?.putString(KEY_CLIENT_ALIASES, o.toString())?.apply()
  }
}

/**
 * KeyManager that presents the Android KeyChain client certificate configured
 * for the connection's target host (mTLS). Reads [SslTrustStore.clientAliases]
 * live on the handshake thread; the private key never leaves the OS keystore —
 * [KeyChain.getPrivateKey] returns a handle the system unlocks. Returns a null
 * alias for hosts without a configured cert, so normal (non-mTLS) TLS is
 * unaffected.
 */
class MtlsKeyManager : X509ExtendedKeyManager() {
  private val tag = "SslTrustStore"

  override fun chooseClientAlias(
    keyType: Array<out String>?,
    issuers: Array<out Principal>?,
    socket: Socket?,
  ): String? = SslTrustStore.getClientAlias(peerHost(socket))

  override fun chooseEngineClientAlias(
    keyType: Array<out String>?,
    issuers: Array<out Principal>?,
    engine: SSLEngine?,
  ): String? = SslTrustStore.getClientAlias(engine?.peerHost)

  override fun getCertificateChain(alias: String?): Array<X509Certificate>? {
    val ctx = SslTrustStore.applicationContext() ?: return null
    if (alias == null) return null
    return try {
      KeyChain.getCertificateChain(ctx, alias)
    } catch (e: Exception) {
      Log.w(tag, "getCertificateChain($alias) failed: ${e.message}")
      null
    }
  }

  override fun getPrivateKey(alias: String?): PrivateKey? {
    val ctx = SslTrustStore.applicationContext() ?: return null
    if (alias == null) return null
    return try {
      KeyChain.getPrivateKey(ctx, alias)
    } catch (e: Exception) {
      Log.w(tag, "getPrivateKey($alias) failed: ${e.message}")
      null
    }
  }

  override fun getClientAliases(
    keyType: String?,
    issuers: Array<out Principal>?,
  ): Array<String>? =
    SslTrustStore.getConfiguredAliases().ifEmpty { return null }.toTypedArray()

  override fun getServerAliases(
    keyType: String?,
    issuers: Array<out Principal>?,
  ): Array<String>? = null

  override fun chooseServerAlias(
    keyType: String?,
    issuers: Array<out Principal>?,
    socket: Socket?,
  ): String? = null

  /**
   * The TLS peer host, preferring the handshake session's `peerHost` (the SNI
   * name, no reverse-DNS lookup) over the resolved address.
   */
  private fun peerHost(socket: Socket?): String? {
    val ssl = socket as? SSLSocket ?: return null
    return try {
      ssl.handshakeSession?.peerHost
    } catch (e: Exception) {
      null
    } ?: ssl.inetAddress?.hostName
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
