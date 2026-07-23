package expo.modules.audiotagger

// Thin JNI surface over the vendored libaudiotagger.so (see native/tagger.cpp).
// The library is prebuilt and committed under jniLibs, so nothing here triggers
// a native build — rebuild it with native/build.sh only when the shim or the
// pinned TagLib version changes.
internal object TagLibBridge {
  @Volatile
  private var loaded = false

  /**
   * Writes [keys]/[values] as a TagLib property map onto [fd], optionally
   * attaching [pictureData] as the front cover.
   *
   * Tags and cover art go in one call because the descriptor is consumed: a
   * second call would need a second descriptor, and a second rewrite of the file.
   *
   * **Takes ownership of [fd].** TagLib's FileStream fdopen()s the descriptor
   * and fclose()s it when it goes out of scope, so the caller must hand over a
   * detached descriptor and must not close it — that would be a double close.
   */
  external fun writeTags(
    fd: Int,
    keys: Array<String>,
    values: Array<String>,
    pictureData: ByteArray?,
    pictureMime: String?,
  ): Boolean

  /**
   * Loads the native library, returning false if it isn't present for this ABI
   * rather than throwing. A missing library must degrade to "file writing
   * unavailable", never crash the app.
   */
  @Synchronized
  fun ensureLoaded(): Boolean {
    if (loaded) return true
    return try {
      System.loadLibrary("audiotagger")
      loaded = true
      true
    } catch (_: UnsatisfiedLinkError) {
      false
    }
  }
}
