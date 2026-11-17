#!/usr/bin/env bash
#
# Builds libwavioalac.so (FFmpeg's ALAC decoder + Media3's JNI glue) for every
# ABI the app ships and drops the results in android/src/main/jniLibs/, which is
# what Gradle packages.
#
# Run this only when bumping FFMPEG_VERSION or re-syncing ffmpeg_jni.cc - the
# built .so files are committed, so day-to-day builds, `expo prebuild` and EAS
# builds need no NDK and no native build step at all.
#
# Usage:  ./build.sh            (uses $ANDROID_HOME and the newest installed NDK)
#         NDK=/path/to/ndk ./build.sh
set -euo pipefail

FFMPEG_VERSION="n7.1.5"
MIN_SDK=26
ABIS=(armeabi-v7a arm64-v8a x86 x86_64)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FFMPEG_DIR="$HERE/.ffmpeg"          # gitignored checkout
BUILD_ROOT="$HERE/.build"           # gitignored intermediates
OUT_DIR="$HERE/../android/src/main/jniLibs"
JOBS="$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

if [[ -z "${NDK:-}" ]]; then
  SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  NDK="$(find "$SDK/ndk" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)"
fi
TOOLCHAIN="$NDK/build/cmake/android.toolchain.cmake"
[[ -f "$TOOLCHAIN" ]] || { echo "NDK toolchain not found at $TOOLCHAIN" >&2; exit 1; }
BIN="$(echo "$NDK/toolchains/llvm/prebuilt/"*/bin)"
echo "Using NDK: $NDK"

if [[ ! -d "$FFMPEG_DIR" ]]; then
  echo "Fetching FFmpeg ${FFMPEG_VERSION}"
  git clone --depth 1 --branch "$FFMPEG_VERSION" https://git.ffmpeg.org/ffmpeg.git "$FFMPEG_DIR"
else
  echo "Reusing FFmpeg checkout at $FFMPEG_DIR"
fi

# Decoder-only and LGPL-only: no --enable-gpl / --enable-nonfree, and nothing
# autodetected from the host (pkg-config, iconv, zlib) can leak into the build.
COMMON_OPTIONS=(
  --target-os=android
  --enable-cross-compile
  --enable-static
  --disable-shared
  --enable-pic
  --enable-small
  --disable-debug
  --disable-doc
  --disable-programs
  --disable-everything
  --disable-autodetect
  --disable-network
  --disable-avdevice
  --disable-avformat
  --disable-avfilter
  --disable-swscale
  --disable-postproc
  --disable-symver
  --disable-v4l2-m2m
  --disable-vulkan
  --enable-swresample
  --enable-decoder=alac
  --pkg-config=false
  --nm="$BIN/llvm-nm"
  --ar="$BIN/llvm-ar"
  --ranlib="$BIN/llvm-ranlib"
  --strip="$BIN/llvm-strip"
)

abi_options() {
  case "$1" in
    armeabi-v7a)
      ABI_OPTIONS=(--arch=arm --cpu=armv7-a --cross-prefix="$BIN/armv7a-linux-androideabi$MIN_SDK-"
        --extra-cflags="-march=armv7-a -mfloat-abi=softfp")
      ;;
    arm64-v8a)
      ABI_OPTIONS=(--arch=aarch64 --cpu=armv8-a --cross-prefix="$BIN/aarch64-linux-android$MIN_SDK-")
      ;;
    x86)
      ABI_OPTIONS=(--arch=x86 --cpu=i686 --cross-prefix="$BIN/i686-linux-android$MIN_SDK-" --disable-asm)
      ;;
    x86_64)
      ABI_OPTIONS=(--arch=x86_64 --cpu=x86-64 --cross-prefix="$BIN/x86_64-linux-android$MIN_SDK-" --disable-asm)
      ;;
  esac
}

for ABI in "${ABIS[@]}"; do
  echo "-- Building ${ABI}"
  FFMPEG_BUILD="$BUILD_ROOT/$ABI/ffmpeg"
  FFMPEG_PREFIX="$BUILD_ROOT/$ABI/prefix"
  rm -rf "$FFMPEG_BUILD" "$FFMPEG_PREFIX"
  mkdir -p "$FFMPEG_BUILD"

  abi_options "$ABI"
  (cd "$FFMPEG_BUILD" && "$FFMPEG_DIR/configure" --prefix="$FFMPEG_PREFIX" \
    "${ABI_OPTIONS[@]}" "${COMMON_OPTIONS[@]}" >/dev/null)

  if ! grep -q '^#define CONFIG_GPL 0$' "$FFMPEG_BUILD/config.h" \
    || ! grep -q '^#define CONFIG_NONFREE 0$' "$FFMPEG_BUILD/config.h"; then
    echo "   FFmpeg was configured with GPL or nonfree code; refusing to build" >&2
    exit 1
  fi

  make -C "$FFMPEG_BUILD" -j"$JOBS" >/dev/null
  make -C "$FFMPEG_BUILD" install-libs install-headers >/dev/null

  cmake -S "$HERE" -B "$BUILD_ROOT/$ABI/jni" \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DANDROID_ABI="$ABI" \
    -DANDROID_PLATFORM="android-$MIN_SDK" \
    -DCMAKE_BUILD_TYPE=MinSizeRel \
    -DFFMPEG_PREFIX="$FFMPEG_PREFIX" \
    -Wno-dev >/dev/null
  cmake --build "$BUILD_ROOT/$ABI/jni" --target wavioalac -j"$JOBS" >/dev/null

  LIB="$OUT_DIR/$ABI/libwavioalac.so"
  mkdir -p "$OUT_DIR/$ABI"
  cp "$BUILD_ROOT/$ABI/jni/libwavioalac.so" "$LIB"
  "$BIN/llvm-strip" --strip-unneeded "$LIB"

  if [[ "$ABI" == "arm64-v8a" || "$ABI" == "x86_64" ]]; then
    ALIGN="$("$BIN/llvm-readelf" -l "$LIB" | awk '/LOAD/ {print $NF}' | sort -u | tail -1)"
    if [[ "$ALIGN" != "0x4000" && "$ALIGN" != "0x10000" ]]; then
      echo "   $ABI LOAD alignment is $ALIGN, expected >= 0x4000 (16 KB)" >&2
      exit 1
    fi
  fi

  # The JNI entry points are the only contract with Java; anything else
  # exported means FFmpeg's symbols leaked past --exclude-libs.
  LEAKED="$("$BIN/llvm-nm" --dynamic --defined-only "$LIB" | awk '{print $NF}' \
    | grep -vE '^(JNI_OnLoad|Java_expo_modules_alacdecoder_.*)$' || true)"
  if [[ -n "$LEAKED" ]]; then
    echo "   $ABI exports unexpected symbols:" >&2
    echo "$LEAKED" >&2
    exit 1
  fi

  echo "   $(du -h "$LIB" | cut -f1)  $ABI"
done

echo
echo "Done. Vendored libraries:"
ls -la "$OUT_DIR"/*/libwavioalac.so | awk '{print "  " $5 " bytes  " $9}'
