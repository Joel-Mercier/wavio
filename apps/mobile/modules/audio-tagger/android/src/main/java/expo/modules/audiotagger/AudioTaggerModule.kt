package expo.modules.audiotagger

import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import org.json.JSONObject

// Maps the JS payload's field names onto TagLib's canonical property keys, which
// TagLib then translates into whatever the container actually uses (TPE2 for an
// ID3v2 album artist, ALBUMARTIST for a Vorbis comment, aART for MP4, and so on)
// — that translation is the whole reason for depending on TagLib.
private val PROPERTY_KEYS = mapOf(
  "title" to "TITLE",
  "artist" to "ARTIST",
  "album" to "ALBUM",
  "albumArtist" to "ALBUMARTIST",
  "year" to "DATE",
  "trackNumber" to "TRACKNUMBER",
  "discNumber" to "DISCNUMBER",
  "musicBrainzRecordingId" to "MUSICBRAINZ_TRACKID",
  "musicBrainzReleaseId" to "MUSICBRAINZ_ALBUMID",
)

class TagWriteException(message: String) : CodedException(message)

class AudioTaggerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioTagger")

    // Synchronous so the UI can gate the "write to files" setting up front. The
    // module can be present while the library is missing for the device's ABI,
    // so presence alone is not enough to report the capability.
    Function("isAvailable") {
      TagLibBridge.ensureLoaded()
    }

    AsyncFunction("writeTags") { uri: String, tagsJson: String ->
      writeTags(uri, tagsJson)
    }
  }

  private fun writeTags(uri: String, tagsJson: String) {
    if (!TagLibBridge.ensureLoaded()) {
      throw TagWriteException("Native tagger unavailable for this ABI")
    }

    val json = JSONObject(tagsJson)
    val keys = ArrayList<String>()
    val values = ArrayList<String>()
    for ((field, property) in PROPERTY_KEYS) {
      if (!json.has(field) || json.isNull(field)) continue
      val value = json.get(field).toString()
      if (value.isEmpty()) continue
      keys.add(property)
      values.add(value)
    }

    val picture = readArtwork(json.optString("artworkPath", ""))
    if (keys.isEmpty() && picture == null) return

    val descriptor = openReadWrite(uri)
      ?: throw TagWriteException("Could not open $uri for writing")

    // detachFd, not use/close: TagLib closes the descriptor itself (see
    // TagLibBridge.writeTags). Closing it here too would be a double close.
    val fd = descriptor.detachFd()
    val ok = try {
      TagLibBridge.writeTags(
        fd,
        keys.toTypedArray(),
        values.toTypedArray(),
        picture,
        json.optString("artworkMimeType", "image/jpeg").ifEmpty { "image/jpeg" },
      )
    } catch (e: Throwable) {
      throw TagWriteException("Tag write failed: ${e.message}")
    }
    if (!ok) {
      throw TagWriteException("Unsupported or unwritable audio file")
    }
  }

  // Cover art is a local app-documents file downloaded from the Cover Art
  // Archive, so it is read here rather than passed across the bridge as base64.
  // A missing or unreadable image is not an error: the tags are still worth
  // writing, and the cover survives in the app-side override layer.
  private fun readArtwork(path: String): ByteArray? {
    if (path.isEmpty()) return null
    return try {
      val file = File(if (path.startsWith("file://")) Uri.parse(path).path!! else path)
      if (file.isFile && file.length() > 0) file.readBytes() else null
    } catch (_: Throwable) {
      null
    }
  }

  // The local library's source folders are Storage Access Framework tree URIs,
  // so most files arrive as content:// and must go through the resolver. Plain
  // file:// paths (legacy entries) are opened directly.
  private fun openReadWrite(uri: String): ParcelFileDescriptor? {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    return if (uri.startsWith("content://")) {
      context.contentResolver.openFileDescriptor(Uri.parse(uri), "rw")
    } else {
      val path = if (uri.startsWith("file://")) Uri.parse(uri).path else uri
      path?.let {
        ParcelFileDescriptor.open(
          File(it),
          ParcelFileDescriptor.MODE_READ_WRITE,
        )
      }
    }
  }
}
