package expo.modules.wearbridge

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.ByteArrayOutputStream

/**
 * Turns a local cover file into the small JPEG that rides to the watch as a
 * Data Layer Asset.
 *
 * The watch has no route to the user's server — it isn't authenticated and may
 * not even have a network — so unlike Android Auto (see car-auto/CarArtwork.kt,
 * which can hand the host an http(s) URI) every cover must travel as bytes.
 * Remote art is downloaded to a cache file by services/wear/artwork.ts, which
 * goes through the app's own networking stack and therefore keeps the server
 * credentials and the ssl-trust certificate exemptions that a raw connection
 * here would lose. By the time it reaches this object the cover is always a
 * plain local file.
 *
 * 320px / JPEG q80 lands around 20-40KB, comfortably inside what the Data Layer
 * will stream, and small enough that a track change costs a fraction of a
 * second over Bluetooth.
 */
internal object WearArtwork {
  private const val MAX_DIM = 320
  private const val QUALITY = 80

  fun encode(fileUri: String): ByteArray? {
    val path = when {
      fileUri.startsWith("file://") -> Uri.parse(fileUri).path
      fileUri.startsWith("/") -> fileUri
      else -> null
    } ?: return null

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
      out.toByteArray()
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
