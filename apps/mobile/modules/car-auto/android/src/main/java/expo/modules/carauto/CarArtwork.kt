package expo.modules.carauto

import android.net.Uri
import androidx.media3.common.MediaMetadata

/**
 * Hands every cover to the host as a `content://` URI from
 * [CarArtworkProvider]: a local file directly, a server URL fetched on first
 * open. The host never fetches a server URL itself. A cover carrying a
 * fallback kind is served as the app's placeholder tile when it can't be read.
 */
internal object CarArtwork {
  fun uriFor(url: String?, fallback: String? = null): Uri? {
    if (url.isNullOrEmpty()) return null
    return when {
      url.startsWith("file://") ->
        Uri.parse(url).path?.let(CarArtworkProvider::contentUri)?.withFallback(fallback)
      url.startsWith("/") -> CarArtworkProvider.contentUri(url)?.withFallback(fallback)
      url.startsWith("http://") || url.startsWith("https://") ->
        CarArtworkProvider.remoteUri(url)?.withFallback(fallback)
      url.startsWith("content://") || url.startsWith("android.resource://") -> Uri.parse(url)
      else -> null
    }
  }

  fun apply(builder: MediaMetadata.Builder, url: String?, fallback: String? = null) {
    (uriFor(url, fallback) ?: fallback?.let(CarArtworkProvider::fallbackUri))
      ?.let { builder.setArtworkUri(it) }
  }

  private fun Uri.withFallback(kind: String?): Uri =
    if (kind == null) this else buildUpon().appendQueryParameter(CarArtworkProvider.FALLBACK_PARAM, kind).build()
}
