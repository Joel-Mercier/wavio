package expo.modules.carauto

import android.content.ContentProvider
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.pm.ProviderInfo
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.util.LruCache
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Cover art for the car host, which resolves these URIs from its own process
 * with none of what Wavio's requests carry (custom headers, an SSO bearer, a
 * trusted self-signed certificate). Two kinds of key:
 *
 * - `art/<key>`: a file already on this device (local library, downloads).
 * - `remote/<key>`: a server URL JS handed us. Fetched on first open through
 *   the app's own OkHttp client — so TLS trust and HTTP/3 routing apply — with
 *   the headers JS pushed for that origin, then served from the cache dir.
 * - `fallback/<kind>`: the app's placeholder tile for an item with no cover.
 *   Either key above can also carry `?fallback=<kind>`, served when the cover
 *   can't be read, so the host never draws its broken-image glyph.
 *
 * Exported, so only keys this process registered resolve: an arbitrary URL
 * passed in by another app is never fetched with the user's credentials.
 */
class CarArtworkProvider : ContentProvider() {
  override fun onCreate(): Boolean {
    context?.let { appContext = it.applicationContext }
    return true
  }

  override fun attachInfo(context: Context, info: ProviderInfo) {
    super.attachInfo(context, info)
    authority = info.authority
    appContext = context.applicationContext
  }

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    if (mode != "r") throw FileNotFoundException("read-only provider: $uri")
    val file = fileFor(uri)
      ?: uri.getQueryParameter(FALLBACK_PARAM)?.let { fallbackFile(it) }
      ?: throw FileNotFoundException("unregistered: $uri")
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  override fun getType(uri: Uri): String? {
    val file = runCatching {
      fileFor(uri) ?: uri.getQueryParameter(FALLBACK_PARAM)?.let { fallbackFile(it) }
    }.getOrNull() ?: return null
    return runCatching {
      file.inputStream().use { stream ->
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
    private const val LOCAL_SEGMENT = "art"
    private const val REMOTE_SEGMENT = "remote"
    private const val FALLBACK_SEGMENT = "fallback"
    const val FALLBACK_PARAM = "fallback"
    private const val FALLBACK_DIR = "car-artwork-fallback-v1"
    private const val FALLBACK_SIZE = 256
    // The app's placeholder: a white glyph at 40% of a primary-600 tile.
    private const val FALLBACK_GLYPH = 102
    private const val FALLBACK_BACKGROUND = 0xFF292929.toInt()
    private const val CACHE_DIR = "car-artwork-v2"
    private const val REGISTRY_FILE = "carauto_artwork_keys.json"
    private const val MAX_FILES = 500
    private const val MAX_BYTES = 10L * 1024 * 1024
    private const val REGISTRY_LIMIT = 3000
    private const val FETCH_TIMEOUT_MS = 10_000L
    private const val RETRY_AFTER_MS = 30_000L

    @Volatile private var authority: String? = null
    @Volatile private var appContext: Context? = null
    @Volatile private var headers: Map<String, Map<String, String>> = emptyMap()
    @Volatile private var timedClient: Pair<OkHttpClient, OkHttpClient>? = null

    private val localPaths = LruCache<String, String>(2048)
    private val remoteUrls = object : LinkedHashMap<String, String>(256, 0.75f, true) {
      override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) =
        size > REGISTRY_LIMIT
    }
    private var registryLoaded = false
    private val downloadLocks = ConcurrentHashMap<String, Any>()
    private val failedAt = ConcurrentHashMap<String, Long>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val persistRegistry = Runnable { writeRegistry() }
    private val fallbackLock = Any()

    fun contentUri(absolutePath: String): Uri? {
      val auth = authority ?: return null
      val file = File(absolutePath)
      val modified = file.lastModified()
      if (modified == 0L && !file.exists()) return null
      val key = keyFor("$absolutePath:$modified")
      localPaths.put(key, absolutePath)
      return build(auth, LOCAL_SEGMENT, key)
    }

    fun remoteUri(url: String): Uri? {
      val auth = authority ?: return null
      val key = keyFor(url)
      val added = synchronized(remoteUrls) {
        loadRegistry()
        remoteUrls.put(key, url) == null
      }
      if (added) {
        mainHandler.removeCallbacks(persistRegistry)
        mainHandler.postDelayed(persistRegistry, 3_000L)
      }
      return build(auth, REMOTE_SEGMENT, key)
    }

    fun fallbackUri(kind: String): Uri? {
      val auth = authority ?: return null
      if (kind !in CarIcons.FALLBACK_ICONS) return null
      return build(auth, FALLBACK_SEGMENT, kind)
    }

    fun setHeaders(json: String) {
      headers = runCatching {
        val root = JSONObject(json)
        root.keys().asSequence().associateWith { origin ->
          val entry = root.optJSONObject(origin) ?: JSONObject()
          entry.keys().asSequence().associateWith { entry.optString(it) }
        }
      }.getOrDefault(emptyMap())
    }

    fun clear() {
      val context = appContext ?: return
      synchronized(remoteUrls) { remoteUrls.clear() }
      localPaths.evictAll()
      failedAt.clear()
      Thread {
        File(context.cacheDir, CACHE_DIR).listFiles()?.forEach { it.delete() }
        File(context.noBackupFilesDir, REGISTRY_FILE).delete()
      }.start()
    }

    private fun build(auth: String, segment: String, key: String): Uri =
      Uri.Builder()
        .scheme(ContentResolver.SCHEME_CONTENT)
        .authority(auth)
        .appendPath(segment)
        .appendPath(key)
        .build()

    private fun fileFor(uri: Uri): File? {
      val segments = uri.pathSegments
      if (segments.size != 2) return null
      val key = segments[1]
      return when (segments[0]) {
        LOCAL_SEGMENT -> localPaths.get(key)?.let(::File)?.takeIf { it.exists() }
        REMOTE_SEGMENT -> remoteFile(key)
        FALLBACK_SEGMENT -> fallbackFile(key)
        else -> null
      }
    }

    private fun remoteFile(key: String): File? {
      val context = appContext ?: return null
      val url = synchronized(remoteUrls) {
        loadRegistry()
        remoteUrls[key]
      } ?: return null
      val dir = File(context.cacheDir, CACHE_DIR).apply { mkdirs() }
      val file = File(dir, key)
      if (file.exists()) {
        file.setLastModified(System.currentTimeMillis())
        return file
      }
      if (failedRecently(key)) return null
      val lock = downloadLocks.getOrPut(key) { Any() }
      synchronized(lock) {
        try {
          if (!file.exists() && !failedRecently(key)) {
            download(url, file)
            if (file.exists()) failedAt.remove(key) else failedAt[key] = SystemClock.elapsedRealtime()
          }
        } finally {
          downloadLocks.remove(key)
        }
      }
      trim(dir)
      return file.takeIf { it.exists() }
    }

    private fun fallbackFile(kind: String): File? {
      val context = appContext ?: return null
      val icon = CarIcons.FALLBACK_ICONS[kind] ?: return null
      val file = File(File(context.cacheDir, FALLBACK_DIR), "$kind.png")
      if (file.exists()) return file
      synchronized(fallbackLock) {
        if (file.exists()) return file
        val id = context.resources.getIdentifier(icon, "drawable", context.packageName)
        if (id == 0) return null
        val glyph = context.getDrawable(id) ?: return null
        val bitmap = Bitmap.createBitmap(FALLBACK_SIZE, FALLBACK_SIZE, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(FALLBACK_BACKGROUND)
        val inset = (FALLBACK_SIZE - FALLBACK_GLYPH) / 2
        glyph.setBounds(inset, inset, inset + FALLBACK_GLYPH, inset + FALLBACK_GLYPH)
        glyph.draw(canvas)
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, "$kind.png.part")
        val written = runCatching {
          temp.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }.getOrDefault(false)
        bitmap.recycle()
        if (!written || !temp.renameTo(file)) {
          temp.delete()
          return null
        }
        return file
      }
    }

    // The host opens covers on binder threads and re-opens a missing one each
    // time it draws the row. An unreachable server must not hold those threads
    // for a full timeout per cover, per redraw.
    private fun failedRecently(key: String): Boolean {
      val at = failedAt[key] ?: return false
      return SystemClock.elapsedRealtime() - at < RETRY_AFTER_MS
    }

    private fun download(url: String, target: File) {
      val parsed = Uri.parse(url)
      val origin = buildString {
        append(parsed.scheme?.lowercase())
        append("://")
        append(parsed.host?.lowercase())
        if (parsed.port != -1) append(":").append(parsed.port)
      }
      val request = Request.Builder().url(url).apply {
        headers[origin]?.forEach { (name, value) -> header(name, value) }
      }.build()
      val temp = File(target.parentFile, "${target.name}.part")
      runCatching {
        fetchClient().newCall(request).execute().use { response ->
          if (!response.isSuccessful) {
            CarAutoLog.d("artwork ${response.code} for $origin")
            return@use
          }
          val body = response.body ?: return@use
          if (body.contentLength() > MAX_BYTES) return@use
          body.byteStream().use { input ->
            temp.outputStream().use { output ->
              val buffer = ByteArray(16 * 1024)
              var total = 0L
              while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > MAX_BYTES) throw IllegalStateException("artwork too large")
                output.write(buffer, 0, read)
              }
            }
          }
          temp.renameTo(target)
        }
      }.onFailure { CarAutoLog.w("artwork fetch failed for $origin", it) }
      temp.delete()
    }

    // React Native's client has no timeouts at all, and this call blocks a
    // binder thread. newBuilder() keeps its TLS, routing and connection pool.
    private fun fetchClient(): OkHttpClient {
      val base = OkHttpClientProvider.getOkHttpClient()
      timedClient?.takeIf { it.first === base }?.let { return it.second }
      val timed = base.newBuilder().callTimeout(FETCH_TIMEOUT_MS, TimeUnit.MILLISECONDS).build()
      timedClient = base to timed
      return timed
    }

    private fun trim(dir: File) {
      val files = dir.listFiles()?.filter { !it.name.endsWith(".part") } ?: return
      if (files.size <= MAX_FILES) return
      files.sortedBy { it.lastModified() }
        .take(files.size - MAX_FILES)
        .forEach { it.delete() }
    }

    private fun loadRegistry() {
      if (registryLoaded) return
      registryLoaded = true
      val context = appContext ?: return
      runCatching {
        val o = JSONObject(File(context.noBackupFilesDir, REGISTRY_FILE).readText())
        for (key in o.keys()) remoteUrls[key] = o.optString(key)
      }
    }

    private fun writeRegistry() {
      val context = appContext ?: return
      val snapshot = synchronized(remoteUrls) { HashMap(remoteUrls) }
      Thread {
        runCatching {
          val temp = File(context.noBackupFilesDir, "$REGISTRY_FILE.tmp")
          temp.writeText(JSONObject(snapshot as Map<*, *>).toString())
          temp.renameTo(File(context.noBackupFilesDir, REGISTRY_FILE))
        }
      }.start()
    }

    private fun keyFor(basis: String): String =
      MessageDigest.getInstance("SHA-256")
        .digest(basis.toByteArray())
        .take(16)
        .joinToString("") { "%02x".format(it) }
  }
}
