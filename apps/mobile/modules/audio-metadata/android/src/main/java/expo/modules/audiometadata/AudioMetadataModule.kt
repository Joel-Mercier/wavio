package expo.modules.audiometadata

import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

class AudioMetadataModule : Module() {
  // `AsyncFunction` bodies run on one HandlerThread shared by every Expo module
  // in the app, and they block rather than suspend — so without our own pool a
  // scan is serialized no matter what `FileSource.extractConcurrency` asks for,
  // and every other module's async call queues behind each extraction. That was
  // invisible while this only ever read local files in milliseconds; over a
  // network share each call is seconds long. Same reasoning as modules/smb and
  // modules/audio-waveform.
  private val executor = Executors.newFixedThreadPool(EXTRACT_THREADS) { r ->
    Thread(r, "wavio-audio-metadata").apply { isDaemon = true }
  }

  override fun definition() = ModuleDefinition {
    Name("AudioMetadata")

    AsyncFunction("getAudioMetadata") {
      uri: String, includeArtwork: Boolean, artworkDir: String?,
      headers: Map<String, String>?, promise: Promise ->
      executor.execute {
        try {
          promise.resolve(extract(uri, includeArtwork, artworkDir, headers))
        } catch (e: Exception) {
          promise.reject("ERR_AUDIO_METADATA", e.message ?: "Extraction failed", e)
        }
      }
    }

    OnDestroy {
      executor.shutdownNow()
    }
  }

  private fun extract(
    uri: String,
    includeArtwork: Boolean,
    artworkDir: String?,
    headers: Map<String, String>?,
  ): Map<String, Any?> {
    val retriever = MediaMetadataRetriever()
    try {
      val parsed = Uri.parse(uri)
      when (parsed.scheme) {
        null, "file" -> retriever.setDataSource(parsed.path ?: uri)
        // A network file share (WebDAV, or SMB via its loopback bridge) is read
        // over HTTP. The ContentResolver overload below cannot open one, so it
        // needs the URL+headers overload — which is also the only way to carry
        // the share's Authorization header.
        "http", "https" -> retriever.setDataSource(uri, headers ?: emptyMap())
        else -> {
          val context = appContext.reactContext
            ?: throw RuntimeException("AudioMetadata: no React context available")
          retriever.setDataSource(context, parsed)
        }
      }

      val result = HashMap<String, Any?>()

      fun raw(key: Int): String? =
        retriever.extractMetadata(key)?.takeIf { it.isNotBlank() }

      raw(MediaMetadataRetriever.METADATA_KEY_TITLE)?.let { result["title"] = it }
      raw(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.let { result["artist"] = it }
      raw(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.let { result["album"] = it }
      raw(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST)?.let {
        result["albumArtist"] = it
      }
      raw(MediaMetadataRetriever.METADATA_KEY_COMPOSER)?.let { result["composer"] = it }
      raw(MediaMetadataRetriever.METADATA_KEY_GENRE)?.let { result["genre"] = it }

      // METADATA_KEY_YEAR is frequently empty; DATE often carries the year.
      (raw(MediaMetadataRetriever.METADATA_KEY_YEAR)
        ?: raw(MediaMetadataRetriever.METADATA_KEY_DATE))
        ?.let(::parseYear)?.let { result["year"] = it }

      // Track / disc come as "n" or "n/total".
      raw(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER)?.let {
        val (n, total) = splitNumber(it)
        if (n != null) result["trackNumber"] = n
        if (total != null) result["trackTotal"] = total
      }
      raw(MediaMetadataRetriever.METADATA_KEY_DISC_NUMBER)?.let {
        val (n, total) = splitNumber(it)
        if (n != null) result["discNumber"] = n
        if (total != null) result["discTotal"] = total
      }

      raw(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
        ?.let { result["durationMs"] = it }
      raw(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull()
        ?.let { result["bitrate"] = it }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        raw(MediaMetadataRetriever.METADATA_KEY_SAMPLERATE)?.toIntOrNull()
          ?.let { result["sampleRate"] = it }
      }
      raw(MediaMetadataRetriever.METADATA_KEY_COMPILATION)?.let {
        result["isCompilation"] = it == "1" || it.equals("true", ignoreCase = true)
      }

      if (includeArtwork) {
        retriever.embeddedPicture?.let { bytes ->
          // When a destination dir is given, persist the picture to a
          // content-hashed file (identical album art across tracks collapses to
          // one file) and hand back a path; otherwise inline it as base64.
          val written = artworkDir?.let { writeArtwork(bytes, it) }
          if (written != null) {
            result["artworkPath"] = written.first
            result["artworkMimeType"] = written.second
          } else if (artworkDir == null) {
            result["artworkBase64"] = Base64.encodeToString(bytes, Base64.NO_WRAP)
          }
        }
      }

      return result
    } catch (e: Exception) {
      throw RuntimeException(
        "AudioMetadata: failed to read \"$uri\": ${e.message}",
        e,
      )
    } finally {
      retriever.release()
    }
  }

  private companion object {
    // The JS side bounds concurrency per file source (4 on device, 6 for SMB,
    // 12 for WebDAV); this only has to be wide enough not to become the new
    // bottleneck under the largest of them.
    const val EXTRACT_THREADS = 12
  }
}

private val YEAR_REGEX = Regex("(\\d{4})")

private fun parseYear(value: String): Int? =
  YEAR_REGEX.find(value)?.groupValues?.get(1)?.toIntOrNull()

/**
 * Write embedded picture bytes to [dirSpec], named by a content hash so the
 * same artwork referenced by many tracks is stored once. Returns
 * (file:// uri, mime) or null on failure.
 */
private fun writeArtwork(bytes: ByteArray, dirSpec: String): Pair<String, String>? =
  try {
    val dir = File(dirSpec.removePrefix("file://"))
    if (!dir.exists()) dir.mkdirs()
    val (ext, mime) = imageType(bytes)
    val out = File(dir, "${sha1Hex(bytes)}.$ext")
    if (!out.exists()) {
      // Write via temp + rename so concurrent extractions of tracks sharing
      // the same artwork never expose a partially written file.
      val tmp = File(dir, "${out.name}.${System.nanoTime()}.tmp")
      tmp.writeBytes(bytes)
      if (!tmp.renameTo(out)) tmp.delete()
    }
    Pair("file://${out.absolutePath}", mime)
  } catch (e: Exception) {
    null
  }

private fun sha1Hex(bytes: ByteArray): String =
  MessageDigest.getInstance("SHA-1").digest(bytes)
    .joinToString("") { "%02x".format(it) }

/** Sniff a JPEG/PNG magic number, defaulting to JPEG. */
private fun imageType(bytes: ByteArray): Pair<String, String> = when {
  bytes.size >= 3 &&
    bytes[0] == 0xFF.toByte() &&
    bytes[1] == 0xD8.toByte() &&
    bytes[2] == 0xFF.toByte() -> "jpg" to "image/jpeg"
  bytes.size >= 8 &&
    bytes[0] == 0x89.toByte() &&
    bytes[1] == 0x50.toByte() &&
    bytes[2] == 0x4E.toByte() &&
    bytes[3] == 0x47.toByte() -> "png" to "image/png"
  else -> "jpg" to "image/jpeg"
}

private fun splitNumber(value: String): Pair<Int?, Int?> {
  val parts = value.split("/", limit = 2)
  val n = parts.getOrNull(0)?.trim()?.toIntOrNull()
  val total = parts.getOrNull(1)?.trim()?.toIntOrNull()
  return n to total
}
