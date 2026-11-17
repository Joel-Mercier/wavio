package expo.modules.carauto

import android.content.ContentResolver
import android.content.Context
import android.net.Uri

/**
 * Tintable vector drawables the host renders for tabs, category rows and
 * list-item actions. Node icons are lucide glyphs (the app's icon set) in this
 * module's res/drawable, kept from resource shrinking by res/raw/car_auto_keep.xml
 * since they are only looked up by name. Item actions use media3's own icons.
 */
internal object CarIcons {
  private val NODE_ICONS = mapOf(
    "home" to "car_icon_home",
    "library" to "car_icon_library",
    "downloads" to "car_icon_download",
    "recent" to "car_icon_history",
    "favorites" to "car_icon_heart",
    "playlists" to "car_icon_playlist",
    "albums" to "car_icon_album",
    "artists" to "car_icon_artist",
    "genres" to "car_icon_genre",
    "radio" to "car_icon_radio",
    "mixes" to "car_icon_mixes",
    "podcasts" to "car_icon_podcast",
    "audiobooks" to "car_icon_audiobook",
    "songs" to "car_icon_songs",
    "search" to "car_icon_search",
    "shuffle" to "car_icon_shuffle",
  )

  val ACTION_ICONS = mapOf(
    "favoriteAdd" to "media3_icon_heart_unfilled",
    "favoriteRemove" to "media3_icon_heart_filled",
    "radio" to "media3_icon_radio",
    "playNext" to "media3_icon_queue_next",
    "addToQueue" to "media3_icon_queue_add",
    "shuffle" to "media3_icon_shuffle_on",
    "download" to "car_icon_download",
  )

  // The glyphs the app draws on a cover that is missing or fails to load,
  // keyed by the `artFallback` JS sends.
  val FALLBACK_ICONS = mapOf(
    "album" to "car_icon_album",
    "artist" to "car_icon_user",
    "playlist" to "car_icon_playlist",
    "track" to "car_icon_track",
    "radio" to "car_icon_radio",
    "podcast" to "car_icon_podcast",
    "audiobook" to "car_icon_audiobook",
  )
  const val TRACK_FALLBACK = "track"

  fun nodeIcon(context: Context, icon: String?): Uri? =
    icon?.let { NODE_ICONS[it] }?.let { resourceUri(context, it) }

  fun resourceUri(context: Context, name: String): Uri? {
    val id = context.resources.getIdentifier(name, "drawable", context.packageName)
    if (id == 0) return null
    return Uri.Builder()
      .scheme(ContentResolver.SCHEME_ANDROID_RESOURCE)
      .authority(context.packageName)
      .appendPath(context.resources.getResourceTypeName(id))
      .appendPath(context.resources.getResourceEntryName(id))
      .build()
  }
}
