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
 * `file://` artwork nor, reliably, an `http(s)` URL of ours. That fetch is the
 * host's, not ours, and it fails in ways we can neither see nor control: it
 * carries none of the server's custom headers and no trust for a self-signed
 * certificate, it answers to the host's own network policy rather than ours,
 * and a screenful of tiles competes for the host's image budget at whatever
 * resolution the URL yields. Issue #156 was reported against a plain-http
 * server, so the certificate case is an example rather than the rule.
 *
 * So local files are published through [CarArtworkProvider] as `content://`
 * URIs, which is what Google's guidance asks for and what the host can always
 * read. JS mirrors remote covers to a local file first (see
 * services/carAuto/artworkMirror.ts) and hands us both halves: the mirrored file
 * and the server URL it came from.
 *
 * The remote URL is the fallback, and it earns its keep — the mirror lives in
 * the cache dir, which the OS may reclaim at any time, while the browse-tree
 * snapshot that references it lives in filesDir and survives. Without the
 * fallback, a cold car session after a cache trim would show nothing at all
 * until JS rebuilt the tree. Byte embedding via `setArtworkData` is the last
 * resort, kept only for the (practically unreachable) case where the provider
 * isn't attached: Google warns against it because many bitmaps in one result
 * blow the 1MB binder limit, hence the budgeting `apply` still supports.
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
   * Sets cover art on [builder], preferring [localArtworkUrl] and falling back
   * to [remoteArtworkUrl]. When [embed] is false the local file is never decoded
   * in the fallback path — the raw uri is used as-is — which lets callers cap
   * how much artwork they embed per transaction. Returns the embedded byte
   * count.
   */
  fun apply(
    builder: MediaMetadata.Builder,
    localArtworkUrl: String?,
    remoteArtworkUrl: String? = null,
    embed: Boolean = true,
  ): Int {
    // Callers that resolved the two halves themselves pass a single value, which
    // may be either kind — and a tree snapshot written before the split holds a
    // local path under the remote field. Sort them out by scheme rather than by
    // which parameter they arrived in.
    val local = listOfNotNull(localArtworkUrl, remoteArtworkUrl)
      .firstOrNull { it.startsWith("file://") }
    val remote = listOfNotNull(localArtworkUrl, remoteArtworkUrl)
      .firstOrNull { !it.startsWith("file://") }

    val path = local?.let { Uri.parse(it).path }
    if (path != null) {
      // Null when the file is gone — fall through to the remote URL rather than
      // publishing a content:// URI the host can only fail to open.
      CarArtworkProvider.contentUri(path)?.let {
        builder.setArtworkUri(it)
        return 0
      }
    }

    if (remote != null) {
      builder.setArtworkUri(Uri.parse(remote))
      return 0
    }

    if (local == null) return 0
    val bytes = if (embed) localArtworkData(local) else null
    if (bytes != null) {
      builder.setArtworkData(bytes, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
      return bytes.size
    }
    builder.setArtworkUri(Uri.parse(local))
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
