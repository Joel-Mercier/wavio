package expo.modules.httpstack

import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/**
 * OkHttp's redirect policy (`RetryAndFollowUpInterceptor`), which the Cronet path
 * bypasses: honours followRedirects / followSslRedirects, rewrites the method
 * like OkHttp does, and drops Authorization when the origin changes.
 */
internal object Redirects {
  const val MAX_FOLLOW_UPS = 20

  private val REDIRECT_CODES = setOf(300, 301, 302, 303, 307, 308)
  private val BODY_HEADERS = listOf("Transfer-Encoding", "Content-Length", "Content-Type")

  fun followUp(client: OkHttpClient, response: Response): Request? {
    if (response.code !in REDIRECT_CODES || !client.followRedirects) return null
    val location = response.header("Location") ?: return null
    val request = response.request
    val url = request.url.resolve(location) ?: return null
    if (url.scheme != request.url.scheme && !client.followSslRedirects) return null

    val builder = request.newBuilder()
    val method = request.method
    if (method != "GET" && method != "HEAD") {
      val keepsMethod = response.code == 307 || response.code == 308
      val maintainBody = method == "PROPFIND" || keepsMethod
      if (method != "PROPFIND" && !keepsMethod) {
        builder.method("GET", null)
      } else {
        builder.method(method, if (maintainBody) request.body else null)
      }
      if (!maintainBody) BODY_HEADERS.forEach { builder.removeHeader(it) }
    }
    if (!sameOrigin(request.url, url)) builder.removeHeader("Authorization")

    val next = builder.url(url).build()
    return if (next.body?.isOneShot() == true) null else next
  }

  private fun sameOrigin(a: HttpUrl, b: HttpUrl): Boolean =
    a.scheme == b.scheme && a.host == b.host && a.port == b.port
}
