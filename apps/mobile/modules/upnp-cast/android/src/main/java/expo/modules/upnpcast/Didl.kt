package expo.modules.upnpcast

/**
 * What the renderer is told the track is.
 *
 * A renderer decides whether it can play something from this description, not by
 * looking at the stream. A speaker offered an item that claims to be video refuses
 * it outright, and our stream URLs carry no file extension for anything to guess
 * from — so the type has to be stated, and stated correctly.
 */
data class Track(
  val url: String,
  val mime: String,
  val title: String,
  val artist: String?,
  val album: String?,
  val artworkUrl: String?,
  val durationSeconds: Int
)

object Didl {
  /**
   * The DIDL-Lite item for a track.
   *
   * `protocolInfo`'s fourth field stays `*` rather than naming a DLNA profile:
   * a server-side transcode cannot promise a specific profile anyway, and the
   * wildcard is universally accepted where a wrong profile name is not.
   */
  fun forTrack(track: Track): String = buildString {
    append("<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\"")
    append(" xmlns:dc=\"http://purl.org/dc/elements/1.1/\"")
    append(" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\">")
    append("<item id=\"0\" parentID=\"-1\" restricted=\"1\">")
    append("<dc:title>").append(Soap.escape(track.title)).append("</dc:title>")
    track.artist?.takeIf { it.isNotEmpty() }?.let {
      // Both spellings: renderers disagree about which one they read.
      append("<upnp:artist>").append(Soap.escape(it)).append("</upnp:artist>")
      append("<dc:creator>").append(Soap.escape(it)).append("</dc:creator>")
    }
    track.album?.takeIf { it.isNotEmpty() }?.let {
      append("<upnp:album>").append(Soap.escape(it)).append("</upnp:album>")
    }
    // Only an address the renderer can reach. Cover art resolved to a file on this
    // phone is worse than none: it renders as a broken image on the device.
    track.artworkUrl
      ?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
      ?.let {
        append("<upnp:albumArtURI>").append(Soap.escape(it)).append("</upnp:albumArtURI>")
      }
    append("<upnp:class>object.item.audioItem.musicTrack</upnp:class>")
    append("<res protocolInfo=\"http-get:*:").append(Soap.escape(track.mime)).append(":*\"")
    if (track.durationSeconds > 0) {
      append(" duration=\"").append(hms(track.durationSeconds)).append("\"")
    }
    append(">").append(Soap.escape(track.url)).append("</res>")
    append("</item></DIDL-Lite>")
  }

  fun hms(seconds: Int): String {
    val safe = seconds.coerceAtLeast(0)
    return "%d:%02d:%02d".format(safe / 3600, (safe % 3600) / 60, safe % 60)
  }

  /** "H:MM:SS" or "H:MM:SS.mmm" back to milliseconds; 0 for the "NOT_IMPLEMENTED" some devices return. */
  fun parseDuration(value: String?): Long {
    if (value.isNullOrBlank()) return 0
    val parts = value.trim().split(':')
    if (parts.isEmpty() || parts.size > 3) return 0
    var total = 0.0
    for (part in parts) {
      val number = part.toDoubleOrNull() ?: return 0
      total = total * 60 + number
    }
    return (total * 1000).toLong()
  }
}
