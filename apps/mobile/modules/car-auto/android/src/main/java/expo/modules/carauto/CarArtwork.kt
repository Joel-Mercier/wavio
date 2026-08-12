package expo.modules.carauto

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import androidx.media3.common.MediaMetadata
import java.io.ByteArrayOutputStream

/**
 * Cover-art bridging for Android Auto. The AA host renders both browse and
 * now-playing art in its *own* process, so it can read neither our app-private
 * `file://` artwork nor, reliably, an `http(s)` URL of ours: that fetch carries
 * none of the server's custom headers, no trust for a self-signed certificate,
 * and its own deadline (issue #156).
 *
 * So local files are published through [CarArtworkProvider] as `content://`
 * URIs, which is what Google's guidance asks for and what the host can always
 * read. JS mirrors remote covers to a local file first (see
 * services/carAuto/artworkMirror.ts), so in the steady state everything here is
 * a file path.
 *
 * A remote URL that hasn't been mirrored yet is still passed through as-is —
 * it's what shipped before and it works for plenty of setups, so it stays as the
 * fallback rather than showing nothing. Byte embedding via `setArtworkData` is
 * the last resort, kept only for the (practically unreachable) case where the
 * provider isn't attached: Google warns against it because many bitmaps in one
 * result blow the 1MB binder limit, hence the budgeting `apply` still supports.
 *
 * `apply` returns the number of embedded bytes (0 for a URI/none) so callers can
 * budget a single binder transaction — see JsProxyPlayer's queue guard.
 */
internal object CarArtwork {
  private const val MAX_DIM = 320
  private const val QUALITY = 80
  private val cache = object : LruCache<String, ByteArray>(8 * 1024 * 1024) {
    override fun sizeOf(key: String, value: ByteArray): Int = value.size
  }

  /**
   * Sets cover art on [builder]. When [embed] is false the local file is never
   * decoded in the fallback path — the raw uri is used as-is — which lets
   * callers cap how much artwork they embed per transaction. Returns the
   * embedded byte count.
   */
  fun apply(builder: MediaMetadata.Builder, artworkUrl: String?, embed: Boolean = true): Int {
    if (artworkUrl == null) return 0

    if (!artworkUrl.startsWith("file://")) {
      builder.setArtworkUri(Uri.parse(artworkUrl))
      return 0
    }

    val path = Uri.parse(artworkUrl).path
    if (path != null) {
      CarArtworkProvider.contentUri(path)?.let {
        builder.setArtworkUri(it)
        return 0
      }
    }

    val bytes = if (embed) localArtworkData(artworkUrl) else null
    if (bytes != null) {
      builder.setArtworkData(bytes, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
      return bytes.size
    }
    builder.setArtworkUri(Uri.parse(artworkUrl))
    return 0
  }

  private fun localArtworkData(uri: String): ByteArray? {
    if (!uri.startsWith("file://")) return null
    val path = Uri.parse(uri).path ?: return null
    cache.get(path)?.let { return it }
    return runCatching {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(path, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
      val opts = BitmapFactory.Options().apply {
        inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight)
      }
      val bmp = BitmapFactory.decodeFile(path, opts) ?: return null
      val out = ByteArrayOutputStream()
      bmp.compress(Bitmap.CompressFormat.JPEG, QUALITY, out)
      bmp.recycle()
      out.toByteArray().also { cache.put(path, it) }
    }.getOrNull()
  }

  // Largest power-of-two subsample that keeps both dimensions >= MAX_DIM.
  private fun sampleSize(width: Int, height: Int): Int {
    var sample = 1
    var w = width
    var h = height
    while (w / 2 >= MAX_DIM && h / 2 >= MAX_DIM) {
      w /= 2
      h /= 2
      sample *= 2
    }
    return sample
  }
}
