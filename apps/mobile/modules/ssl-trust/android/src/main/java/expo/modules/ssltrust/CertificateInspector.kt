package expo.modules.ssltrust

import java.net.URI
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Fetches the leaf certificate from a server *without* validating it, so the
 * user can inspect a self-signed cert before deciding to trust it.
 */
object CertificateInspector {
  private const val HANDSHAKE_TIMEOUT_MS = 8000

  fun inspect(url: String): Map<String, Any?> {
    val uri = URI(url)
    val host = uri.host ?: throw IllegalArgumentException("invalid URL: $url")
    val port = if (uri.port != -1) uri.port else 443

    // Trust-all context purely for inspection — the returned cert is shown to
    // the user, never persisted as trusted here.
    val acceptAll = object : X509TrustManager {
      override fun checkClientTrusted(c: Array<out X509Certificate>?, a: String?) {}
      override fun checkServerTrusted(c: Array<out X509Certificate>?, a: String?) {}
      override fun getAcceptedIssuers() = arrayOf<X509Certificate>()
    }
    val context = SSLContext.getInstance("TLS")
    context.init(null, arrayOf<TrustManager>(acceptAll), SecureRandom())

    val socket = context.socketFactory.createSocket() as SSLSocket
    try {
      socket.soTimeout = HANDSHAKE_TIMEOUT_MS
      socket.connect(java.net.InetSocketAddress(host, port), HANDSHAKE_TIMEOUT_MS)
      socket.startHandshake()
      val leaf = socket.session.peerCertificates.firstOrNull() as? X509Certificate
        ?: throw IllegalStateException("server presented no X509 certificate")

      return mapOf(
        "hostname" to host,
        "subject" to leaf.subjectX500Principal.name,
        "issuer" to leaf.issuerX500Principal.name,
        "sha256Fingerprint" to SslTrustStore.getFingerprint(leaf),
        "validFrom" to iso(leaf.notBefore),
        "validTo" to iso(leaf.notAfter),
        "serialNumber" to leaf.serialNumber.toString(16).uppercase(),
        "selfSigned" to isSelfSigned(leaf),
        "systemTrusted" to isSystemTrusted(arrayOf(leaf)),
      )
    } finally {
      try {
        socket.close()
      } catch (_: Exception) {
      }
    }
  }

  private fun isSelfSigned(cert: X509Certificate): Boolean =
    try {
      cert.verify(cert.publicKey)
      true
    } catch (e: Exception) {
      // Subject == issuer is a weaker fallback when the key check throws.
      cert.subjectX500Principal == cert.issuerX500Principal
    }

  private fun isSystemTrusted(chain: Array<X509Certificate>): Boolean =
    try {
      val tmf = javax.net.ssl.TrustManagerFactory.getInstance(
        javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm(),
      )
      tmf.init(null as java.security.KeyStore?)
      val tm = tmf.trustManagers.filterIsInstance<X509TrustManager>().first()
      tm.checkServerTrusted(chain, "RSA")
      true
    } catch (e: Exception) {
      false
    }

  private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
    .apply { timeZone = TimeZone.getTimeZone("UTC") }

  private fun iso(date: java.util.Date): String = isoFormat.format(date)
}
