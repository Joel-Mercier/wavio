package expo.modules.ssltrust

import android.util.Log
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLSession
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient

/**
 * Builds the OkHttpClient React Native uses for its networking (fetch / axios),
 * layering the pinned SSL socket factory + custom hostname verifier on top of
 * RN's own builder so its required `ReactCookieJarContainer` is preserved.
 *
 * Reached via a dynamic Proxy from [SslTrustStore.installCustomTrustManager];
 * this module does not compile-depend on react-android (RN is provided at
 * runtime), hence the reflection on `OkHttpClientProvider.createClientBuilder`.
 */
class CustomOkHttpClientFactory(
  private val sslSocketFactory: SSLSocketFactory,
  private val trustManager: X509TrustManager,
) {
  fun createNewNetworkModuleClient(): OkHttpClient {
    // Base on RN's own builder (carries ReactCookieJarContainer — a bare
    // OkHttpClient.Builder leaves CookieJar.NO_COOKIES, which RN then casts to
    // CookieJarContainer and crashes). createClientBuilder() does NOT consult
    // the factory, so no recursion.
    val builder = try {
      val providerClass =
        Class.forName("com.facebook.react.modules.network.OkHttpClientProvider")
      val createClientBuilder = providerClass.getMethod("createClientBuilder")
      createClientBuilder.invoke(null) as OkHttpClient.Builder
    } catch (e: Exception) {
      Log.w("SslTrustStore", "createClientBuilder() reflection failed: ${e.message}")
      OkHttpClient.Builder()
    }
    return builder
      .sslSocketFactory(sslSocketFactory, trustManager)
      .hostnameVerifier(CustomHostnameVerifier())
      .build()
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
}
