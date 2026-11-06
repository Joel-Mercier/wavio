package expo.modules.httpstack

import android.util.Log
import java.io.IOException
import java.net.ProtocolException
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import okhttp3.internal.connection.RealCall

/**
 * Last interceptor of every client the stack builds. Sends a request to Cronet
 * or lets it continue on OkHttp. On the Cronet path it replays what OkHttp would
 * have run after it: interceptors other libraries appended to a derived client
 * (expo/fetch, expo-image progress), the cookie jar, the network interceptors,
 * and the redirect policy. Each redirect hop is routed again, so a hop to a
 * vetoed host or to http:// continues on OkHttp.
 */
internal object TransportRouter : Interceptor {
  private val warned = AtomicBoolean()

  override fun intercept(chain: Interceptor.Chain): Response {
    val enabled = Http3Settings.isEnabled()
    val lease = CronetEngineHolder.lease
    if (!enabled || lease == null) return proceedOnOkHttp(chain, chain.request(), enabled)

    val client = (chain.call() as? RealCall)?.client
    val index = client?.interceptors?.indexOfFirst { it === this } ?: -1
    if (client == null || index < 0) {
      if (warned.compareAndSet(false, true)) {
        Log.w(HttpStack.TAG, "call isn't an OkHttp RealCall with the router; using OkHttp")
      }
      return proceedOnOkHttp(chain, chain.request(), true)
    }
    val steps = client.interceptors.subList(index + 1, client.interceptors.size) +
      CookieBridge(client.cookieJar) + client.networkInterceptors + lease

    var request = chain.request()
    var followUps = 0
    while (true) {
      if (TransportPolicy.decide(request, HttpStack.vetoes.values) == Route.OKHTTP) {
        return proceedOnOkHttp(chain, request, true)
      }
      val response = proceedOnCronet(chain, steps, request)
        ?: return proceedOnOkHttp(chain, request, true)
      val next = Redirects.followUp(client, response) ?: return response
      response.close()
      if (++followUps > Redirects.MAX_FOLLOW_UPS) {
        throw ProtocolException("Too many follow-up requests: $followUps")
      }
      request = next
    }
  }

  /** Null when a TLS-class failure pinned the host and OkHttp should replay it. */
  private fun proceedOnCronet(
    chain: Interceptor.Chain,
    steps: List<Interceptor>,
    request: Request,
  ): Response? =
    try {
      ReplayChain(chain, steps, 0, request).proceed(request).also {
        TransportStats.recordCronet(request.url.host, it.protocol)
      }
    } catch (e: IOException) {
      if (!CronetFailures.isTlsClass(e) || request.body?.isOneShot() == true) {
        throw CronetFailures.translate(e)
      }
      TransportPolicy.pin(request.url.host)
      Log.i(HttpStack.TAG, "TLS failure via Cronet for ${request.url.host}; on OkHttp for now")
      null
    }

  private fun proceedOnOkHttp(
    chain: Interceptor.Chain,
    request: Request,
    record: Boolean,
  ): Response {
    val response = chain.proceed(request)
    if (record) TransportStats.recordOkHttp(request.url.host, response.protocol)
    return response
  }
}
