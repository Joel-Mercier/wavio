package expo.modules.carauto

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import androidx.media3.common.MediaMetadata
import java.io.ByteArrayOutputStream

/**
 * Cover-art bridging for Android Auto. The AA host renders both browse and
 * now-playing art in its *own* process, so it can fetch an http(s) artworkUri
 * itself but cannot read our app-private file:// artwork (the local library
 * writes covers under filesDir/local-artwork). For local files we decode +
 * downscale the bitmap in-process and ship the JPEG bytes via setArtworkData,
 * which travels across the binder so the host can render it without filesystem
 * access. Remote URLs keep using setArtworkUri (small, fetched by the host).
 *
 * Bytes are kept small (max 320px, JPEG q80 → ~20-40KB) and cached by path so
 * album/queue items that share one cover only decode once. `apply` returns the
 * number of embedded bytes (0 for a URI/none) so callers can budget a single
 * binder transaction — see JsProxyPlayer's queue guard.
 */
internal object CarArtwork {
  private const val MAX_DIM = 320
  private const val QUALITY = 80
  private val cache = object : LruCache<String, ByteArray>(8 * 1024 * 1024) {
    override fun sizeOf(key: String, value: ByteArray): Int = value.size
  }

  /**
   * Sets cover art on [builder]. When [embed] is false the local file is never
   * decoded — the raw uri is used as-is — which lets callers cap how much
   * artwork they embed per transaction. Returns the embedded byte count.
   */
  fun apply(builder: MediaMetadata.Builder, artworkUrl: String?, embed: Boolean = true): Int {
    if (artworkUrl == null) return 0
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
