package expo.modules.upnpcast

import android.net.Uri

/**
 * Whether two URIs name the same stream, allowing for what renderers do to them.
 *
 * A renderer hands back the URI it was given rewritten: entities still escaped,
 * percent-encoding normalised, a vendor scheme bolted on (Sonos reports
 * `x-sonos-http:` in front of anything it fetched over HTTP), or the query string
 * reordered. Our own stream URLs also carry a salted auth token that differs on
 * every call, so the same track built twice is two different strings.
 *
 * So the comparison is by identity, not by text: the `id` query parameter when
 * both sides have one — it is the track — and host plus path otherwise, which is
 * what a radio stream or a podcast enclosure is identified by.
 */
object StreamUri {
  fun same(a: String?, b: String?): Boolean {
    if (a.isNullOrBlank() || b.isNullOrBlank()) return false
    val left = parse(a) ?: return false
    val right = parse(b) ?: return false
    val leftId = left.getQueryParameter("id")
    val rightId = right.getQueryParameter("id")
    if (!leftId.isNullOrEmpty() && !rightId.isNullOrEmpty()) {
      return leftId == rightId && left.host.equals(right.host, ignoreCase = true)
    }
    return left.host.equals(right.host, ignoreCase = true) &&
      (left.path ?: "").trimEnd('/').equals((right.path ?: "").trimEnd('/'), ignoreCase = true)
  }

  private fun parse(raw: String): Uri? {
    var text = Soap.unescape(raw.trim())
    for (prefix in VENDOR_PREFIXES) {
      if (text.startsWith(prefix, ignoreCase = true)) {
        text = text.substring(prefix.length)
        break
      }
    }
    val uri = runCatching { Uri.parse(text) }.getOrNull() ?: return null
    return if (uri.host.isNullOrEmpty()) null else uri
  }

  private val VENDOR_PREFIXES = listOf(
    "x-sonos-http:",
    "x-sonosapi-stream:",
    "x-rincon-mp3radio:",
    "x-file-cifs:",
    "x-sonos-spotify:"
  )
}
