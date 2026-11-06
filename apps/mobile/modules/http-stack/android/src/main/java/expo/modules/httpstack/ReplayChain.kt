package expo.modules.httpstack

import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Connection
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/**
 * Runs [steps] as OkHttp would have run them after the router, ending in the
 * Cronet step, which never proceeds. There's no OkHttp connection on this path.
 */
internal class ReplayChain(
  private val outer: Interceptor.Chain,
  private val steps: List<Interceptor>,
  private val index: Int,
  private val request: Request,
) : Interceptor.Chain {
  override fun request(): Request = request

  override fun proceed(request: Request): Response {
    check(index < steps.size) { "Cronet replay chain has no terminal step" }
    return steps[index].intercept(ReplayChain(outer, steps, index + 1, request))
  }

  override fun connection(): Connection? = null

  override fun call(): Call = outer.call()

  override fun connectTimeoutMillis(): Int = outer.connectTimeoutMillis()

  override fun withConnectTimeout(timeout: Int, unit: TimeUnit): Interceptor.Chain =
    ReplayChain(outer.withConnectTimeout(timeout, unit), steps, index, request)

  override fun readTimeoutMillis(): Int = outer.readTimeoutMillis()

  override fun withReadTimeout(timeout: Int, unit: TimeUnit): Interceptor.Chain =
    ReplayChain(outer.withReadTimeout(timeout, unit), steps, index, request)

  override fun writeTimeoutMillis(): Int = outer.writeTimeoutMillis()

  override fun withWriteTimeout(timeout: Int, unit: TimeUnit): Interceptor.Chain =
    ReplayChain(outer.withWriteTimeout(timeout, unit), steps, index, request)
}
