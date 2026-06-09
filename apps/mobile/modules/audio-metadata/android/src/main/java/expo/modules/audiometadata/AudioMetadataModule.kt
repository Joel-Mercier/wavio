package expo.modules.audiometadata

import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

class AudioMetadataModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioMetadata")

    AsyncFunction("getAudioMetadata") {
      uri: String, includeArtwork: Boolean, artworkDir: String? ->
      extract(uri, includeArtwork, artworkDir)
    }
  }

  private fun extract(
    uri: String,
    includeArtwork: Boolean,
    artworkDir: String?,
  ): Map<String, Any?> {
    val retriever = MediaMetadataRetriever()
    try {
      val parsed = Uri.parse(uri)
      when (parsed.scheme) {
        null, "file" -> retriever.setDataSource(parsed.path ?: uri)
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
    if (!out.exists()) out.writeBytes(bytes)
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
