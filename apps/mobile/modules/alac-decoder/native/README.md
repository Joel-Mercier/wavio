# alac-decoder native

Decodes ALAC on Android with [FFmpeg](https://ffmpeg.org/)'s ALAC decoder, through the
JNI glue and `FfmpegAudioRenderer` of Media3's `decoder_ffmpeg` extension. iOS needs
none of this: AVPlayer decodes ALAC natively.

## Why it exists

Android ships no reliable ALAC decoder. Pixels and AOSP builds have none, so media3
never selects the track and plays silence (issue #228). Some vendors, Qualcomm's
`c2.qti.alac` among them, advertise one that fails at runtime. `AlacRenderersFactory`
puts the FFmpeg renderer ahead of MediaCodec, and the expo-audio patch builds both of
its players with it. FFmpeg is built with the ALAC decoder **only**, so the renderer
reports every other format unsupported, and AAC, MP3, FLAC, Opus and the rest keep
going to MediaCodec exactly as before.

## What is vendored from where

| File | Source | License |
| --- | --- | --- |
| `android/src/main/java/expo/modules/alacdecoder/Ffmpeg*.java` | androidx/media `1.9.1`, `libraries/decoder_ffmpeg/src/main/java` | Apache-2.0 |
| `native/ffmpeg_jni.cc` | androidx/media `1.9.1`, `libraries/decoder_ffmpeg/src/main/jni` | Apache-2.0 |
| `android/src/main/jniLibs/<abi>/libwavioalac.so` | the above + FFmpeg `n7.1.5`, built by `build.sh` | LGPL-2.1-or-later (FFmpeg) |

The copies differ from upstream in exactly three ways (plus one path in a lint comment): the Java package
(`expo.modules.alacdecoder`), the library name (`wavioalac` instead of `ffmpegJNI`, so
it can never clash with another dependency shipping the FFmpeg extension), and the JNI
names in `ffmpeg_jni.cc` that follow from both. Keep it that way, so a re-sync stays a
copy plus those renames.

## Licensing

FFmpeg is configured without `--enable-gpl` and `--enable-nonfree`, so the library is
LGPL-2.1-or-later. `build.sh` refuses to produce a `.so` if `config.h` says otherwise.
FFmpeg is linked statically into `libwavioalac.so`, which is its own shared library and
can be replaced as a whole. Its corresponding source is FFmpeg `n7.1.5` from
<https://git.ffmpeg.org/ffmpeg.git>, built by the `build.sh` and `CMakeLists.txt` in this
folder. Don't swap in a prebuilt FFmpeg extension from elsewhere without checking its
license: Jellyfin's `org.jellyfin.media3:media3-ffmpeg-decoder` is published as GPL-3.0.

## Rebuilding

Only needed when `ffmpeg_jni.cc` changes or `FFMPEG_VERSION` in `build.sh` is bumped.

```sh
cd apps/mobile/modules/alac-decoder/native
./build.sh                  # uses $ANDROID_HOME and the newest installed NDK
NDK=/path/to/ndk ./build.sh # or point it at a specific NDK
```

`build.sh` clones FFmpeg at the pinned tag into `.ffmpeg/` (gitignored), configures a
static, decoder-only build per ABI (`--disable-everything --enable-decoder=alac`, plus
swresample for the output conversion), links the JNI glue against it, strips, and
writes the results into `jniLibs/`. Then commit the changed `.so` files. The script
fails if a library exports anything beyond the JNI entry points, or if a 64-bit
library isn't 16 KB page aligned. Each library is about 350–450 KB, and a device only
carries its own ABI.

## Things that will bite you

- **Media3 must match expo-audio's.** The Java here is copied from one Media3 release
  and compiled against it (`compileOnly`, at the version in `android/build.gradle`);
  expo-audio supplies Media3 at runtime. `__tests__/alacDecoder.media3Version.test.ts`
  fails when expo-audio's `androidxMedia3Version` moves. When it does, re-copy the four
  Java files and `ffmpeg_jni.cc` from the matching androidx/media tag, reapply the
  renames above, and rebuild if the JNI changed. Also mirror the `compileOnly`
  dependencies of that tag's `libraries/decoder_ffmpeg/build.gradle` (today
  `checker-qual`): Media3 doesn't pass them on, so a missing one only fails in Gradle.
- **JNI names are the contract.** `Java_expo_modules_alacdecoder_<Class>_<method>` and
  the `FindClass("expo/modules/alacdecoder/FfmpegAudioDecoder")` in `JNI_OnLoad` break
  at **runtime**, not build time, if a class moves or is renamed.
- **R8.** Native code calls `FfmpegAudioDecoder.growOutputBuffer` by name, so
  `android/consumer-rules.pro` keeps it and the classes in its signature. A release
  build without the rule only fails once an ALAC track starts.
- **Decoding, not demuxing.** Media3's MP4 extractor still parses the container; this
  adds no new file formats.
- **If the library can't load**, `FfmpegLibrary.isAvailable()` is false, the renderer
  reports ALAC unsupported, and playback falls back to the platform's behaviour: the
  existing server-transcode retry and the "unsupported format" notice still apply.
