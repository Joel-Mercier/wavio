package expo.modules.castserver

import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import kotlin.math.min

/**
 * The HTTP/1.1 subset the cast server speaks: one request per connection, GET and
 * HEAD, byte ranges.
 *
 * Copied from modules/smb's SmbBridge.kt rather than shared with it: that bridge is
 * hardened and in production, and a refactor reaching into it is risk for nothing a
 * listener would notice. A fix to the range parsing in one belongs in both, and
 * in the two iOS copies (SmbBridge.swift, CastServer.swift).
 */
internal object HttpWire {
  // A request head this large is not one a receiver sends.
  private const val HEAD_LIMIT = 16 * 1024

  /** Request line + headers, or null when the head never terminated. */
  fun readHead(input: InputStream): List<String>? {
    val buffer = StringBuilder()
    var consecutive = 0
    while (buffer.length < HEAD_LIMIT) {
      val byte = input.read()
      if (byte == -1) return null
      // Latin-1 by construction: our paths are ASCII, so the head is too.
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

  fun header(head: List<String>, name: String): String? =
    head.asSequence()
      .drop(1)
      .firstOrNull { it.substringBefore(':').trim().lowercase() == name }
      ?.substringAfter(':')
      ?.trim()

  /**
   * `bytes=a-b`, `bytes=a-` and `bytes=-n`, resolved against [size]. Null means
   * unsatisfiable; no header at all means the whole file.
   */
  fun parseRange(value: String?, size: Long): LongRange? {
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

  /**
   * The status line and headers. `Content-Length` defaults to 0 when absent and a
   * body length is known to be empty; pass `null` for [contentLength] when the body
   * runs until the connection closes (an upstream that sent no length).
   *
   * The DLNA headers go last, after `Connection`: at least one Samsung TV only reads
   * `contentFeatures.dlna.org` when it is the final header, and both are ignored by
   * everything that isn't a DLNA renderer.
   */
  fun writeHead(
    output: OutputStream,
    code: Int,
    reason: String,
    headers: List<Pair<String, String>> = emptyList(),
    contentLength: Long? = 0L,
    dlna: Dlna? = null,
  ) {
    val builder = StringBuilder("HTTP/1.1 $code $reason\r\n")
    for ((name, value) in headers) builder.append("$name: $value\r\n")
    if (contentLength != null) builder.append("Content-Length: $contentLength\r\n")
    builder.append("Connection: close\r\n")
    if (dlna != null) {
      builder.append("transferMode.dlna.org: ${dlna.transferMode}\r\n")
      builder.append("contentFeatures.dlna.org: ${dlna.contentFeatures}\r\n")
    }
    builder.append("\r\n")
    output.write(builder.toString().toByteArray(Charsets.ISO_8859_1))
  }

  fun constantTimeEquals(known: String, candidate: String): Boolean =
    MessageDigest.isEqual(known.toByteArray(), candidate.toByteArray())

  class Dlna(val transferMode: String, val contentFeatures: String)

  // OP=01: byte seeking is supported. FLAGS: streaming + background transfer modes,
  // connection stall allowed, DLNA 1.5 — the value DLNA servers send for a plain
  // file served with Range support.
  val DLNA_AUDIO = Dlna(
    "Streaming",
    "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000",
  )

  val DLNA_IMAGE = Dlna(
    "Interactive",
    "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=00D00000000000000000000000000000",
  )
}
