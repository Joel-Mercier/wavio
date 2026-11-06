package expo.modules.httpstack

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.net.cronet.okhttptransport.CronetInterceptor
import com.google.net.cronet.okhttptransport.RedirectStrategy
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.Interceptor
import okhttp3.MediaType
import okhttp3.Response
import okhttp3.ResponseBody
import okio.Buffer
import okio.BufferedSource
import okio.ForwardingSource
import okio.buffer
import org.chromium.net.CronetEngine

/**
 * Terminal Cronet step. `CronetInterceptor` polls its calls every 500 ms from
 * construction until `close()`, so it only exists while Cronet responses are
 * open, and for [IDLE_CLOSE_MS] after the last one finishes. Redirects come back
 * as responses: [TransportRouter] follows them, one hop per request.
 */
internal class CronetLease(private val engine: CronetEngine) : Interceptor {
  private val lock = Any()
  private val handler = Handler(Looper.getMainLooper())
  private var current: CronetInterceptor? = null
  private var inFlight = 0

  private val closeIdle = Runnable {
    synchronized(lock) {
      if (inFlight == 0) {
        current?.close()
        current = null
        Log.d(HttpStack.TAG, "cronet interceptor closed (idle)")
      }
    }
  }

  override fun intercept(chain: Interceptor.Chain): Response {
    val interceptor = acquire()
    val response = try {
      interceptor.intercept(chain)
    } catch (t: Throwable) {
      release()
      throw t
    }
    val body = response.body
    if (body == null) {
      release()
      return response
    }
    return response.newBuilder().body(LeasedBody(body, ::release)).build()
  }

  private fun acquire(): CronetInterceptor = synchronized(lock) {
    handler.removeCallbacks(closeIdle)
    inFlight++
    current ?: CronetInterceptor.newBuilder(engine)
      .setRedirectStrategy(RedirectStrategy.withoutRedirects())
      .build()
      .also { current = it }
  }

  private fun release() {
    synchronized(lock) {
      if (inFlight > 0) inFlight--
      if (inFlight == 0) handler.postDelayed(closeIdle, IDLE_CLOSE_MS)
    }
  }

  private companion object {
    const val IDLE_CLOSE_MS = 30_000L
  }
}

/**
 * Releases the lease once, when the body is closed or fully read, and maps
 * mid-stream Cronet failures (e.g. a network change) to java.net exceptions.
 */
private class LeasedBody(
  private val delegate: ResponseBody,
  private val onDone: () -> Unit,
) : ResponseBody() {
  private val done = AtomicBoolean()

  private fun finish() {
    if (done.compareAndSet(false, true)) onDone()
  }

  private val leasedSource: BufferedSource by lazy {
    object : ForwardingSource(delegate.source()) {
      override fun read(sink: Buffer, byteCount: Long): Long {
        val read = try {
          super.read(sink, byteCount)
        } catch (e: IOException) {
          finish()
          throw CronetFailures.translate(e)
        }
        if (read == -1L) finish()
        return read
      }

      override fun close() {
        try {
          delegate.close()
        } finally {
          finish()
        }
      }
    }.buffer()
  }

  override fun contentType(): MediaType? = delegate.contentType()

  override fun contentLength(): Long = delegate.contentLength()

  override fun source(): BufferedSource = leasedSource

  override fun close() {
    try {
      delegate.close()
    } finally {
      finish()
    }
  }
}
