package expo.modules.ssltrust

import expo.modules.httpstack.TlsContributor
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLSession
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager

/** The TOFU trust manager and mTLS key manager, lent to every OkHttp client. */
class SslTrustTls(
  override val sslSocketFactory: SSLSocketFactory,
  override val trustManager: X509TrustManager,
) : TlsContributor {
  override val hostnameVerifier: HostnameVerifier = CustomHostnameVerifier()
}

/**
 * Accepts trusted hosts even when the certificate CN/SAN doesn't match the
 * hostname (common for self-signed certs accessed by IP / LAN name).
 *
 * The explicitly-trusted-host check runs FIRST: a self-signed cert's CN/SAN
 * usually doesn't list the name it's reached by, so the platform default
 * verifier returns false — or throws, which (if called first) would propagate
 * out and fail the connection even though TLS trust already passed. So once a
 * host is trusted we short-circuit to accept, and any default-verifier
 * exception is swallowed rather than aborting the request.
 */
class CustomHostnameVerifier : HostnameVerifier {
  private val default = HttpsURLConnection.getDefaultHostnameVerifier()

  override fun verify(hostname: String, session: SSLSession): Boolean {
    if (SslTrustStore.isCertificateTrusted(hostname)) return true
    val def = try {
      default.verify(hostname, session)
    } catch (e: Exception) {
      false
    }
    if (def) return true
    return try {
      val cert = session.peerCertificates.firstOrNull() as? X509Certificate
      cert != null &&
        SslTrustStore.isFingerprintTrusted(SslTrustStore.getFingerprint(cert))
    } catch (e: Exception) {
      false
    }
  }
}
