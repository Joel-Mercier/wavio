package expo.modules.castserver

import android.content.Context
import android.net.Uri
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.Closeable
import java.io.File
import java.io.FileInputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.util.concurrent.TimeUnit
import kotlin.math.min

/** What one request ended as, for the casting log. */
internal data class Served(val status: Int, val bytes: Long)

/**
 * Where a registered track's or cover's bytes come from.
 *
 * Two kinds cover every library: a file this phone can open itself (`file://`, or a
 * SAF `content://` document under a folder grant the app already holds), and an
 * HTTP resource fetched on the receiver's behalf with headers it could never send —
 * an SMB share's loopback bridge, a WebDAV server's `Authorization`, a remote
 * server's single sign-on token or Cloudflare Access headers.
 */
internal sealed interface MediaSource {
  fun serve(method: String, range: String?, output: OutputStream, mime: String, dlna: HttpWire.Dlna): Served

  companion object {
    /** Parses the record JS registers; null for anything malformed. */
    fun from(context: Context, record: Map<String, Any?>): MediaSource? =
      when (record["kind"]) {
        "local" -> (record["uri"] as? String)?.let { LocalSource(context, it) }
        "upstream" -> (record["url"] as? String)
          ?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
          ?.let { url ->
            val headers = (record["headers"] as? Map<*, *>)
              ?.mapNotNull { (name, value) ->
                if (name is String && value is String) name to value else null
              }
              ?.toMap()
              .orEmpty()
            UpstreamSource(url, headers)
          }
        else -> null
      }
  }
}

internal class LocalSource(private val context: Context, private val uri: String) : MediaSource {
  private class Opened(val channel: FileChannel, val size: Long, val closeable: Closeable)

  private fun open(): Opened? {
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      "file" -> {
        val file = File(parsed.path ?: return null)
        if (!file.isFile) return null
        val handle = RandomAccessFile(file, "r")
        Opened(handle.channel, handle.length(), handle)
      }
      "content" -> {
        val descriptor = context.contentResolver.openFileDescriptor(parsed, "r") ?: return null
        val stream = FileInputStream(descriptor.fileDescriptor)
        val channel = stream.channel
        val size = descriptor.statSize.takeIf { it >= 0 } ?: channel.size()
        Opened(channel, size, Closeable {
          runCatching { stream.close() }
          runCatching { descriptor.close() }
        })
      }
      else -> null
    }
  }

  override fun serve(
    method: String,
    range: String?,
    output: OutputStream,
    mime: String,
    dlna: HttpWire.Dlna,
  ): Served {
    val opened = try {
      open()
    } catch (_: SecurityException) {
      // The folder grant was revoked since the library was scanned.
      null
    } catch (_: Exception) {
      null
    } ?: run {
      HttpWire.writeHead(output, 404, "Not Found")
      return Served(404, 0)
    }
    try {
      val size = opened.size
      val requested = HttpWire.parseRange(range, size) ?: run {
        HttpWire.writeHead(
          output,
          416,
          "Range Not Satisfiable",
          listOf("Content-Range" to "bytes */$size"),
        )
        return Served(416, 0)
      }
      val length = requested.last - requested.first + 1
      val partial = range != null
      val headers = buildList {
        add("Content-Type" to mime)
        add("Accept-Ranges" to "bytes")
        if (partial) add("Content-Range" to "bytes ${requested.first}-${requested.last}/$size")
      }
      val status = if (partial) 206 else 200
      HttpWire.writeHead(
        output,
        status,
        if (partial) "Partial Content" else "OK",
        headers,
        contentLength = length,
        dlna = dlna,
      )
      if (method != "GET" || length <= 0) return Served(status, 0)
      return Served(status, copy(opened.channel, requested.first, length, output))
    } finally {
      runCatching { opened.closeable.close() }
    }
  }

  private fun copy(channel: FileChannel, start: Long, length: Long, output: OutputStream): Long {
    val buffer = ByteBuffer.allocate(min(CHUNK.toLong(), length).toInt())
    channel.position(start)
    var remaining = length
    var sent = 0L
    while (remaining > 0) {
      buffer.clear()
      buffer.limit(min(buffer.capacity().toLong(), remaining).toInt())
      val read = channel.read(buffer)
      if (read <= 0) break
      output.write(buffer.array(), 0, read)
      remaining -= read
      sent += read
    }
    output.flush()
    return sent
  }

  private companion object {
    const val CHUNK = 256 * 1024
  }
}

internal class UpstreamSource(
  private val url: String,
  private val headers: Map<String, String>,
) : MediaSource {
  override fun serve(
    method: String,
    range: String?,
    output: OutputStream,
    mime: String,
    dlna: HttpWire.Dlna,
  ): Served {
    val builder = Request.Builder().url(url)
    for ((name, value) in headers) builder.header(name, value)
    // Without this OkHttp asks for gzip and inflates it transparently, which drops
    // Content-Length and breaks every range a receiver asks for afterwards.
    builder.header("Accept-Encoding", "identity")
    if (range != null) builder.header("Range", range)
    if (method == "HEAD") builder.head() else builder.get()

    val response = try {
      client().newCall(builder.build()).execute()
    } catch (_: Exception) {
      HttpWire.writeHead(output, 502, "Bad Gateway")
      return Served(502, 0)
    }
    response.use {
      val code = response.code
      if (code == 416) {
        val contentRange = response.header("Content-Range")
        HttpWire.writeHead(
          output,
          416,
          "Range Not Satisfiable",
          listOfNotNull(contentRange?.let { "Content-Range" to it }),
        )
        return Served(416, 0)
      }
      if (code == 404 || code == 410) {
        HttpWire.writeHead(output, 404, "Not Found")
        return Served(404, 0)
      }
      // An upstream refusal (401/403 behind a proxy whose token expired, a 5xx)
      // is the gateway failing, not the track missing: a receiver that caches a 404
      // as "gone" would never ask again.
      if (code != 200 && code != 206) {
        HttpWire.writeHead(output, 502, "Bad Gateway")
        return Served(502, 0)
      }
      val length = response.header("Content-Length")?.toLongOrNull()
      val forwarded = buildList {
        add("Content-Type" to mime)
        val ranges = response.header("Accept-Ranges")
          ?: if (code == 206) "bytes" else null
        ranges?.let { add("Accept-Ranges" to it) }
        if (code == 206) response.header("Content-Range")?.let { add("Content-Range" to it) }
      }
      HttpWire.writeHead(
        output,
        code,
        if (code == 206) "Partial Content" else "OK",
        forwarded,
        // No length upstream means the body runs until the connection closes, which
        // `Connection: close` already says.
        contentLength = length,
        dlna = dlna,
      )
      if (method != "GET") return Served(code, 0)
      val body = response.body ?: return Served(code, 0)
      var sent = 0L
      body.byteStream().use { input ->
        val buffer = ByteArray(CHUNK)
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          output.write(buffer, 0, read)
          sent += read
        }
      }
      output.flush()
      return Served(code, sent)
    }
  }

  private companion object {
    const val CHUNK = 256 * 1024

    @Volatile private var shared: OkHttpClient? = null

    /**
     * The app's client (modules/http-stack builds it), with a read timeout long
     * enough for a NAS waking from sleep and no call timeout: a whole track is one
     * call, and it is meant to last.
     */
    fun client(): OkHttpClient =
      shared ?: synchronized(this) {
        shared ?: OkHttpClientProvider.getOkHttpClient()
          .newBuilder()
          .readTimeout(30, TimeUnit.SECONDS)
          .callTimeout(0, TimeUnit.MILLISECONDS)
          .build()
          .also { shared = it }
      }
  }
}
