package expo.modules.smb

import android.net.Uri
import com.hierynomus.smbj.share.File as SmbFile
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet6Address
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.SynchronousQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import kotlin.math.min

/**
 * Loopback HTTP server that fronts an SMB share.
 *
 * Neither Media3 nor `MediaMetadataRetriever` speaks SMB, and `expo-audio`
 * exposes no custom `DataSource` hook, so the only way to play a file off a share
 * is to make it look like an HTTP resource. Everything downstream — the player,
 * the native metadata reader, the offline downloader, the waveform analyser, and
 * the JS raw-tag reader — then needs no SMB-specific code at all.
 *
 * Same shape as `modules/ssl-trust/ios/SslTrustProxy.swift`: loopback-only
 * listener, OS-assigned port, opaque token as the first path segment. That one is
 * a byte pipe between two HTTP peers, though; this one has to author its own
 * responses, and `Range` support is what makes seeking within a track work.
 */
internal object SmbBridge {
  private const val BACKLOG = 16

  // One thread per in-flight request, and a playing track holds its thread for
  // the whole track. A scan adds `extractConcurrency` metadata reads plus their
  // ranged tag reads, so the ceiling sits well above that — but it *is* a
  // ceiling: anything on the device can open a loopback socket, and an unbounded
  // pool would let one spawn threads without limit. Over it, `acceptLoop` closes
  // the connection.
  private const val CORE_WORKERS = 2
  private const val MAX_WORKERS = 32
  private const val WORKER_KEEPALIVE_SECONDS = 60L

  // A request head this large is not one of ours.
  private const val HEAD_LIMIT = 16 * 1024

  // One SMB read per chunk, issued one after the next, so this — not the link —
  // is what bounds a single stream. Measured against a NAS at 64 KB: ~30 ms per
  // chunk for 1.9 MB/s, while the same megabyte pulled as 16 concurrent range
  // requests landed in a third of the time. smbj clamps every read to
  // min(its own 1 MB buffer, the dialect's negotiated max), so asking for more
  // than a server allows degrades to that server's maximum instead of failing.
  private const val CHUNK = 1024 * 1024

  private val LOOPBACK_V4 = byteArrayOf(127, 0, 0, 1)

  // Short while reading the request head, so a client that connects and says
  // nothing can't hold a worker; raised for the body, where an SMB read can
  // legitimately stall on a NAS waking from sleep.
  private const val HEAD_TIMEOUT_MS = 5_000
  private const val BODY_TIMEOUT_MS = 30_000

  private val random = SecureRandom()

  // Mixed into every token so it can't be derived from the share's address by
  // another app on the device — unlike ssl-trust's, this token is what stops
  // anything else on the phone reading the user's files.
  private val salt = ByteArray(16).also { random.nextBytes(it) }

  private val lock = Any()
  private var serverSocket: ServerSocket? = null

  // SynchronousQueue rather than a buffer: `execute` either starts a thread (up to
  // MAX_WORKERS) or rejects outright, so an over-limit connection is refused at
  // once instead of queueing behind a track that plays for four minutes.
  private val pool = ThreadPoolExecutor(
    CORE_WORKERS,
    MAX_WORKERS,
    WORKER_KEEPALIVE_SECONDS,
    TimeUnit.SECONDS,
    SynchronousQueue<Runnable>(),
  ) { r -> Thread(r, "wavio-smb-bridge").apply { isDaemon = true } }

  private val targets = ConcurrentHashMap<String, SmbTarget>()
  private val timeouts = ConcurrentHashMap<String, Long>()

  /**
   * URL an HTTP consumer on this device can open for [path].
   *
   * Starts the listener if it isn't running, so this stays correct when called as
   * the very first thing after a cold start — `FileSource.playableUrl` is
   * synchronous and has nowhere to wait. Binding a loopback socket doesn't touch
   * the network.
   */
  fun urlFor(target: SmbTarget, path: String, timeoutMs: Long): String {
    val authority = ensureListening()
    val token = tokenFor(target)
    targets[token] = target
    timeouts[token] = timeoutMs
    val absolute = if (path.startsWith("/")) path else "/$path"
    return "http://$authority/$token${Uri.encode(absolute, "/")}"
  }

  fun stop() {
    synchronized(lock) {
      runCatching { serverSocket?.close() }
      serverSocket = null
    }
    targets.clear()
    timeouts.clear()
  }

  /** The `host:port` every URL above is built from. Binds if it has to. */
  private fun ensureListening(): String {
    synchronized(lock) {
      val existing = serverSocket
      if (existing != null && !existing.isClosed) return authorityOf(existing)
      val socket = bindLoopback()
      serverSocket = socket
      Thread({ acceptLoop(socket) }, "wavio-smb-accept").apply {
        isDaemon = true
        start()
      }
      return authorityOf(socket)
    }
  }

  /**
   * Loopback only. Binding the LAN interface would expose the user's whole share
   * to the network, which is a casting concern and not this.
   *
   * IPv4 explicitly, rather than `InetAddress.getLoopbackAddress()`: that answers
   * `::1` on some devices, and a listener on `::1` refuses every connection to
   * `127.0.0.1` — which is what the metadata reader, Media3 and the JS ranged
   * reads all dial. The symptom is not "unreachable" but "slow": each read fails,
   * `NuCachedSource2` retries it ten times three seconds apart, and a scan turns
   * into half a minute per track indexing nothing.
   */
  private fun bindLoopback(): ServerSocket =
    try {
      ServerSocket(0, BACKLOG, InetAddress.getByAddress(LOOPBACK_V4))
    } catch (_: IOException) {
      // A loopback with no IPv4 address is not a thing we expect to meet, but
      // the authority is derived from whatever actually got bound, so falling
      // back here can't reintroduce the mismatch above.
      ServerSocket(0, BACKLOG, InetAddress.getLoopbackAddress())
    }

  /** Bracketed for IPv6, per RFC 3986 — `::1:8080` parses as neither. */
  private fun authorityOf(socket: ServerSocket): String {
    val address = socket.inetAddress
    val host = address?.hostAddress ?: "127.0.0.1"
    return if (address is Inet6Address) {
      "[$host]:${socket.localPort}"
    } else {
      "$host:${socket.localPort}"
    }
  }

  private fun acceptLoop(socket: ServerSocket) {
    try {
      while (!socket.isClosed) {
        val client = try {
          socket.accept()
        } catch (_: IOException) {
          // Closed by stop(), or the listener died; either way this loop is over
          // and the next urlFor() re-binds.
          return
        }
        try {
          pool.execute { serve(client) }
        } catch (_: Exception) {
          runCatching { client.close() }
        }
      }
    } finally {
      // Disown the socket on the way out, so ensureListening() re-binds.
      //
      // Without this, an accept() that fails for any reason *other* than stop()
      // closing the socket leaves a non-null, non-closed `serverSocket` behind
      // with no thread accepting on it: urlFor() keeps handing out a live port
      // and every request to it hangs until its timeout. Only clear what we
      // still own — stop() may already have replaced it — which is the same
      // ownership re-check SmbBridge.swift does around listenFD.
      synchronized(lock) {
        if (serverSocket === socket) serverSocket = null
      }
      runCatching { socket.close() }
    }
  }

  private fun serve(client: Socket) {
    try {
      client.tcpNoDelay = true
      client.soTimeout = HEAD_TIMEOUT_MS
      val input = BufferedInputStream(client.getInputStream())
      val output = BufferedOutputStream(client.getOutputStream())
      val head = readHead(input) ?: return
      client.soTimeout = BODY_TIMEOUT_MS
      handle(head, output)
      output.flush()
    } catch (_: Exception) {
      // A client that hangs up mid-response is normal: Media3 abandons its
      // connection on every seek.
    } finally {
      runCatching { client.close() }
    }
  }

  private fun handle(head: List<String>, output: OutputStream) {
    val request = head.firstOrNull()?.split(" ") ?: return
    if (request.size < 3) {
      respondStatus(output, 400, "Bad Request")
      return
    }
    val method = request[0].uppercase()
    if (method != "GET" && method != "HEAD") {
      respondStatus(output, 405, "Method Not Allowed")
      return
    }

    val (token, path) = splitTarget(request[1]) ?: run {
      respondStatus(output, 400, "Bad Request")
      return
    }
    // 404 rather than 403: a wrong token shouldn't confirm that the bridge is
    // serving anything at all.
    val target = lookup(token) ?: run {
      respondStatus(output, 404, "Not Found")
      return
    }
    val timeoutMs = timeouts[token] ?: 20_000L

    val file = try {
      SmbConnection.openForRead(target, path, timeoutMs)
    } catch (_: SmbPathException) {
      respondStatus(output, 404, "Not Found")
      return
    } catch (_: Exception) {
      respondStatus(output, 502, "Bad Gateway")
      return
    }

    try {
      val size = file.fileInformation.standardInformation.endOfFile
      val requested = header(head, "range")
      val range = parseRange(requested, size)
      if (range == null) {
        // Explicitly unsatisfiable, per RFC 9110 — a player that asked past the
        // end needs the real length back, not a truncated body.
        respondStatus(
          output,
          416,
          "Range Not Satisfiable",
          mapOf("Content-Range" to "bytes */$size", "Content-Length" to "0"),
        )
        return
      }

      val length = range.last - range.first + 1
      val partial = requested != null
      val headers = buildMap<String, String> {
        put("Content-Type", contentType(path))
        put("Content-Length", length.toString())
        put("Accept-Ranges", "bytes")
        if (partial) {
          put("Content-Range", "bytes ${range.first}-${range.last}/$size")
        }
      }
      respondStatus(
        output,
        if (partial) 206 else 200,
        if (partial) "Partial Content" else "OK",
        headers,
      )
      if (method == "GET") stream(file, range.first, length, output)
    } finally {
      runCatching { file.close() }
    }
  }

  private fun stream(file: SmbFile, start: Long, length: Long, output: OutputStream) {
    // Sized to the response rather than to CHUNK: the JS raw-tag reader asks for
    // as little as four bytes, and buying a megabyte of heap per such request
    // would cost more than the request itself.
    val buffer = ByteArray(min(CHUNK.toLong(), length).toInt())
    var offset = start
    var remaining = length
    while (remaining > 0) {
      val want = min(buffer.size.toLong(), remaining).toInt()
      val read = file.read(buffer, offset, 0, want)
      if (read <= 0) break
      output.write(buffer, 0, read)
      offset += read
      remaining -= read
    }
    output.flush()
  }

  /** Request line + headers, or null when the head never terminated. */
  private fun readHead(input: InputStream): List<String>? {
    val buffer = StringBuilder()
    var consecutive = 0
    while (buffer.length < HEAD_LIMIT) {
      val byte = input.read()
      if (byte == -1) return null
      // Latin-1 by construction: paths reach us percent-encoded, so the head is
      // pure ASCII.
      val char = Char(byte)
      buffer.append(char)
      consecutive = when {
        char == '\n' && consecutive == 1 -> 2
        char == '\n' -> 1
        char == '\r' -> consecutive
        else -> 0
      }
      if (consecutive == 2) {
        return buffer.toString().split("\r\n", "\n").filter { it.isNotEmpty() }
      }
    }
    return null
  }

  private fun splitTarget(requestTarget: String): Pair<String, String>? {
    val trimmed = requestTarget.substringBefore('?').removePrefix("/")
    val separator = trimmed.indexOf('/')
    if (separator <= 0) return null
    val token = trimmed.substring(0, separator)
    val path = Uri.decode(trimmed.substring(separator))
    if (path.isEmpty()) return null
    return token to path
  }

  private fun lookup(token: String): SmbTarget? {
    // Constant-time over the registered tokens, so a wrong guess leaks nothing
    // about how much of it was right.
    var found: SmbTarget? = null
    for ((known, target) in targets) {
      if (MessageDigest.isEqual(known.toByteArray(), token.toByteArray())) {
        found = target
      }
    }
    return found
  }

  private fun header(head: List<String>, name: String): String? =
    head.asSequence()
      .drop(1)
      .firstOrNull { it.substringBefore(':').trim().lowercase() == name }
      ?.substringAfter(':')
      ?.trim()

  /**
   * `bytes=a-b`, `bytes=a-` and `bytes=-n`, resolved against [size]. Null means
   * unsatisfiable; no header at all means the whole file.
   */
  private fun parseRange(value: String?, size: Long): LongRange? {
    // An empty file has no satisfiable range, but is a perfectly good 200 with
    // no body.
    if (size <= 0) return if (value == null) 0L..-1L else null
    if (value == null) return 0L until size
    val spec = value.substringAfter("bytes=", "").substringBefore(',').trim()
    if (spec.isEmpty()) return null
    val dash = spec.indexOf('-')
    if (dash < 0) return null

    val startText = spec.substring(0, dash).trim()
    val endText = spec.substring(dash + 1).trim()
    if (startText.isEmpty()) {
      val suffix = endText.toLongOrNull() ?: return null
      if (suffix <= 0) return null
      val start = maxOf(0L, size - suffix)
      return start until size
    }
    val start = startText.toLongOrNull() ?: return null
    if (start >= size) return null
    val end = if (endText.isEmpty()) {
      size - 1
    } else {
      min(endText.toLongOrNull() ?: return null, size - 1)
    }
    if (end < start) return null
    return start..end
  }

  private fun respondStatus(
    output: OutputStream,
    code: Int,
    reason: String,
    headers: Map<String, String> = emptyMap(),
  ) {
    val builder = StringBuilder("HTTP/1.1 $code $reason\r\n")
    for ((name, value) in headers) builder.append("$name: $value\r\n")
    if (!headers.containsKey("Content-Length")) {
      builder.append("Content-Length: 0\r\n")
    }
    // No keep-alive: one request per connection is all Media3 and the metadata
    // reader need, and it removes every way to get connection reuse wrong.
    builder.append("Connection: close\r\n\r\n")
    output.write(builder.toString().toByteArray())
  }

  /** Stable per (process, share) so `urlFor` is idempotent and the map is bounded. */
  private fun tokenFor(target: SmbTarget): String {
    val digest = MessageDigest.getInstance("SHA-256")
    digest.update(salt)
    digest.update(target.key.toByteArray())
    return digest.digest().take(16).joinToString("") { "%02x".format(it) }
  }

  // Media3 picks its extractor partly from Content-Type, so a wrong or missing
  // one shows up as a file that plays locally but not off the share. Keys match
  // AUDIO_EXTENSIONS in services/local/indexer.ts.
  private fun contentType(path: String): String =
    when (path.substringAfterLast('.', "").lowercase()) {
      "mp3" -> "audio/mpeg"
      "flac" -> "audio/flac"
      "m4a", "alac" -> "audio/mp4"
      "aac" -> "audio/aac"
      "ogg", "oga" -> "audio/ogg"
      "opus" -> "audio/opus"
      "wav" -> "audio/wav"
      "wma" -> "audio/x-ms-wma"
      "aiff", "aif" -> "audio/aiff"
      else -> "application/octet-stream"
    }
}
