package expo.modules.carauto

import android.content.ContentProvider
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.pm.ProviderInfo
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.LruCache
import java.io.File
import java.io.FileNotFoundException
import java.security.MessageDigest

/**
 * Serves cover art to the Android Auto host as `content://` URIs.
 *
 * The host renders browse items in its own process. It cannot read our
 * app-private files, and while it will fetch an `http(s)` icon URI itself, that
 * fetch has none of what our own stack carries — the server's custom headers,
 * the trust decision for a self-signed certificate, our timeouts — so covers
 * that load perfectly in the app come back blank in the car (issue #156). A
 * local URI is the documented answer:
 * https://developer.android.com/training/cars/media/create-media-browser/media-artwork
 *
 * Exported, like the reference implementation (UAMP's AlbumArtContentProvider),
 * because the host resolves these URIs with no grant from us. What keeps that
 * safe is the registry: only paths this app itself published through
 * [contentUri] can be opened, and the key is a digest of the path, so the
 * provider cannot be walked into arbitrary app-private files. Read-only, no
 * query/insert/update/delete.
 */
class CarArtworkProvider : ContentProvider() {
  override fun onCreate(): Boolean = true

  override fun attachInfo(context: Context, info: ProviderInfo) {
    super.attachInfo(context, info)
    // The authority carries ${applicationId}, so read it back rather than
    // rebuilding it from the package name.
    authority = info.authority
  }

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    if (mode != "r") throw FileNotFoundException("read-only provider: $uri")
    val key = uri.lastPathSegment ?: throw FileNotFoundException("no key: $uri")
    val path = resolve(key) ?: throw FileNotFoundException("unregistered: $uri")
    val file = File(path)
    // The mirror lives in cacheDir, which the OS may reclaim under storage
    // pressure — a registered key whose file is gone is normal, not a bug.
    if (!file.exists()) throw FileNotFoundException(path)
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  // Files are stored without an extension (the writers sniff content rather
  // than trusting a name), so report the type from the magic bytes.
  override fun getType(uri: Uri): String? {
    val path = uri.lastPathSegment?.let { resolve(it) } ?: return null
    return runCatching {
      File(path).inputStream().use { stream ->
        val head = ByteArray(4)
        if (stream.read(head) < 4) return@use null
        when {
          head[0] == 0xFF.toByte() && head[1] == 0xD8.toByte() -> "image/jpeg"
          head[0] == 0x89.toByte() && head[1] == 'P'.code.toByte() -> "image/png"
          head[0] == 'R'.code.toByte() && head[1] == 'I'.code.toByte() -> "image/webp"
          head[0] == 'G'.code.toByte() && head[1] == 'I'.code.toByte() -> "image/gif"
          else -> "image/*"
        }
      }
    }.getOrNull()
  }

  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?,
  ): Cursor? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<out String>?,
  ): Int = 0

  override fun delete(
    uri: Uri,
    selection: String?,
    selectionArgs: Array<out String>?,
  ): Int = 0

  companion object {
    private const val SEGMENT = "art"

    @Volatile private var authority: String? = null

    // Bounded so a long-lived process browsing a large library can't grow it
    // without limit. Well above the covers one browse tree plus a queue holds;
    // an evicted key just means the host gets a 404 for a screen it is no longer
    // showing, and re-browsing re-registers it.
    private val paths = LruCache<String, String>(2048)

    /**
     * The `content://` URI for a local artwork file, registering it on the way
     * out. Null before the provider has been attached (i.e. never, in practice —
     * providers are created at process start, long before a car host binds), and
     * null for a file that isn't there: the mirror lives in the reclaimable
     * cache dir, so callers need to hear "no" and fall back rather than hand the
     * host a URI that can only 404.
     */
    fun contentUri(absolutePath: String): Uri? {
      val auth = authority ?: return null
      val file = File(absolutePath)
      val modified = file.lastModified()
      if (modified == 0L && !file.exists()) return null
      // The mirror rewrites a refreshed cover to the *same* path, and the host
      // caches by URI — so fold the file's mtime into the key, or a cover that
      // changed on the server would keep rendering the old bytes in the car.
      val key = keyFor("$absolutePath:$modified")
      paths.put(key, absolutePath)
      return Uri.Builder()
        .scheme(ContentResolver.SCHEME_CONTENT)
        .authority(auth)
        .appendPath(SEGMENT)
        .appendPath(key)
        .build()
    }

    private fun resolve(key: String): String? = paths.get(key)

    private fun keyFor(basis: String): String =
      MessageDigest.getInstance("SHA-256")
        .digest(basis.toByteArray())
        .take(16)
        .joinToString("") { "%02x".format(it) }
  }
}
