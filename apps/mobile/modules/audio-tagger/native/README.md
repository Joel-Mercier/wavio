# audio-tagger native

Writes corrected tags into audio files, backed by [TagLib](https://github.com/taglib/taglib).

## Why the library is prebuilt and committed

`android/src/main/jniLibs/<abi>/libaudiotagger.so` is **built here and committed**.
`android/build.gradle` deliberately has no `externalNativeBuild` — Gradle only packages
the prebuilt binaries. That keeps normal app builds, `expo prebuild` and EAS builds free
of any NDK or CMake dependency; the native toolchain is only needed by whoever runs
`build.sh`.

## Rebuilding

Only needed when `tagger.cpp` changes or `TAGLIB_VERSION` in `build.sh` is bumped.

```sh
cd apps/mobile/modules/audio-tagger/native
./build.sh                  # uses $ANDROID_HOME and the newest installed NDK
NDK=/path/to/ndk ./build.sh # or point it at a specific NDK
```

`build.sh` clones TagLib at the pinned tag into `.taglib/` (gitignored — the source is
not vendored), builds a static `libtag` plus the JNI shim for every ABI in
`reactNativeArchitectures`, strips, and writes the results into `jniLibs/`.
Then commit the changed `.so` files.

Built with `-Os`, `-fvisibility=hidden`, `--gc-sections` and `--exclude-libs,ALL`, so each
library exports exactly **one** symbol — the JNI entry point. Verify after a rebuild:

```sh
llvm-nm --dynamic --defined-only jniLibs/arm64-v8a/libaudiotagger.so
# → Java_expo_modules_audiotagger_TagLibBridge_writeTags
```

Approximate sizes: 600 KB (armeabi-v7a), ~1 MB (arm64-v8a, x86, x86_64). A device only
ever carries its own ABI.

## Things that will bite you

- **The JNI symbol name is the contract.** It is derived from the Kotlin package and
  class: `expo.modules.audiotagger.TagLibBridge.writeTags` →
  `Java_expo_modules_audiotagger_TagLibBridge_writeTags`. Renaming or moving `TagLibBridge`,
  or making the method `@JvmStatic` or a companion member, changes the expected name and
  fails at **runtime**, not build time.
- **The file descriptor is handed over, not borrowed.** `TagLib::FileStream(int)` calls
  `fdopen()` and its destructor `fclose()`s, closing the descriptor. Kotlin therefore uses
  `ParcelFileDescriptor.detachFd()` and must not close it — a `use {}` block there would be
  a double close.
- **Type detection is content-based**, not extension-based: a Storage Access Framework
  descriptor has no path to inspect.
- **Formats are trimmed for size**: trackers (`WITH_MOD`), Shorten and zlib are off. MP3,
  FLAC, MP4/M4A, Ogg/Opus/Vorbis, WAV/AIFF, WMA and APE remain.
- **Cover art goes in via the complex-property API** (`setComplexProperties("PICTURE", ...)`),
  which TagLib translates to APIC for ID3v2, a PICTURE block for FLAC, `covr` for MP4 and
  METADATA_BLOCK_PICTURE for Xiph. The `pictureType` string is matched exactly and an
  unrecognised value silently degrades to `Other`, so `"Front Cover"` is load-bearing.
- **Tags and cover art are written in one call**, because the descriptor is consumed by
  the first `FileStream` — a second call would need a second descriptor and would rewrite
  the file twice.
- **Kotlin reads the image bytes**, not C++ and not JavaScript: the cover is an app-local
  file, so passing a path avoids base64-ing a few hundred KB per track across the bridge.
