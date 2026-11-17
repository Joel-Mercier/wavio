package expo.modules.httpstack

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.Interceptor
import okhttp3.Response

/**
 * The cookie half of OkHttp's `BridgeInterceptor`, which Cronet bypasses. Uses
 * the call's own jar, so RN's per-request `CookieJar.NO_COOKIES` is respected.
 */
internal class CookieBridge(private val jar: CookieJar) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    if (jar === CookieJar.NO_COOKIES) return chain.proceed(request)
    val cookies = jar.loadForRequest(request.url)
    val outgoing = if (cookies.isEmpty()) {
      request
    } else {
      request.newBuilder()
        .header("Cookie", cookies.joinToString("; ") { "${it.name}=${it.value}" })
        .build()
    }
    val response = chain.proceed(outgoing)
    val received = Cookie.parseAll(request.url, response.headers)
    if (received.isNotEmpty()) jar.saveFromResponse(request.url, received)
    return response
  }
}
