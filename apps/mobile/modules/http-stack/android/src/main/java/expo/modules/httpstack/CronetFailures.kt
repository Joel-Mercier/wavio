package expo.modules.httpstack

import com.google.net.cronet.okhttptransport.CronetTimeoutException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException
import org.chromium.net.NetworkException

/**
 * Maps Cronet failures to the java.net exceptions OkHttp throws, which the JS
 * error classifiers and media3's retry policy match on.
 */
internal object CronetFailures {
  // Chromium net_error_list.h: handshake, client-auth and certificate errors
  // (-200..-220), plus QUIC_CERT_ROOT_NOT_KNOWN. Connection-level codes stay out:
  // replaying those on OkHttp would only double the wait.
  private val TLS_CODES = setOf(
    -107, -110, -113, -117, -134, -135, -141, -150, -151, -153, -156, -159,
    -164, -167, -177, -180, -181, -380,
  )

  private fun networkException(e: Throwable): NetworkException? =
    generateSequence(e) { it.cause }.take(8).filterIsInstance<NetworkException>().firstOrNull()

  // The HttpEngine provider's NetworkException returns a constant -508 from
  // getCronetInternalErrorCode(); the real net error only survives in the message
  // ("…, ErrorCode=11, InternalErrorCode=-202").
  private const val NOT_REPORTED = -508
  private val INTERNAL_CODE = Regex("InternalErrorCode=(-?\\d+)")

  private fun internalCode(ne: NetworkException): Int {
    val code = ne.cronetInternalErrorCode
    if (code != NOT_REPORTED) return code
    return ne.message?.let { INTERNAL_CODE.find(it) }?.groupValues?.get(1)?.toIntOrNull() ?: code
  }

  fun isTlsClass(e: Throwable): Boolean {
    val code = networkException(e)?.let(::internalCode) ?: return false
    return code in -220..-200 || code in TLS_CODES
  }

  fun translate(e: IOException): IOException {
    if (generateSequence(e as Throwable) { it.cause }.take(8).any { it is CronetTimeoutException }) {
      return SocketTimeoutException("timeout (cronet)").apply { initCause(e) }
    }
    val ne = networkException(e) ?: return e
    val detail = ne.message ?: "cronet"
    val translated = when {
      isTlsClass(e) -> SSLHandshakeException("SSL handshake failed: $detail")
      else -> when (ne.errorCode) {
        NetworkException.ERROR_HOSTNAME_NOT_RESOLVED ->
          UnknownHostException("Unable to resolve host: $detail")
        NetworkException.ERROR_INTERNET_DISCONNECTED,
        NetworkException.ERROR_ADDRESS_UNREACHABLE,
        NetworkException.ERROR_CONNECTION_REFUSED ->
          ConnectException("Failed to connect: $detail")
        NetworkException.ERROR_TIMED_OUT,
        NetworkException.ERROR_CONNECTION_TIMED_OUT ->
          SocketTimeoutException("timeout: $detail")
        NetworkException.ERROR_CONNECTION_CLOSED,
        NetworkException.ERROR_CONNECTION_RESET,
        NetworkException.ERROR_NETWORK_CHANGED,
        NetworkException.ERROR_QUIC_PROTOCOL_FAILED ->
          SocketException("Connection reset: $detail")
        else -> return e
      }
    }
    translated.initCause(e)
    return translated
  }
}
