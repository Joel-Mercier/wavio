#!/usr/bin/env bash
#
# Builds libaudiotagger.so for every ABI the app ships and drops the results in
# android/src/main/jniLibs/, which is what Gradle packages.
#
# Run this only when bumping TAGLIB_VERSION or changing tagger.cpp - the built
# .so files are committed, so day-to-day builds, `expo prebuild` and EAS builds
# need no NDK and no native build step at all.
#
# Usage:  ./build.sh            (uses $ANDROID_HOME and the newest installed NDK)
#         NDK=/path/to/ndk ./build.sh
set -euo pipefail

TAGLIB_VERSION="v2.3.1"
MIN_SDK=26
ABIS=(armeabi-v7a arm64-v8a x86 x86_64)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAGLIB_DIR="$HERE/.taglib"          # gitignored checkout
BUILD_ROOT="$HERE/.build"           # gitignored intermediates
OUT_DIR="$HERE/../android/src/main/jniLibs"

if [[ -z "${NDK:-}" ]]; then
  SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  NDK="$(find "$SDK/ndk" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)"
fi
TOOLCHAIN="$NDK/build/cmake/android.toolchain.cmake"
[[ -f "$TOOLCHAIN" ]] || { echo "NDK toolchain not found at $TOOLCHAIN" >&2; exit 1; }
echo "Using NDK: $NDK"

if [[ ! -d "$TAGLIB_DIR" ]]; then
  echo "Fetching taglib ${TAGLIB_VERSION}"
  git clone --depth 1 --branch "$TAGLIB_VERSION" --recurse-submodules \
    https://github.com/taglib/taglib.git "$TAGLIB_DIR"
else
  echo "Reusing taglib checkout at $TAGLIB_DIR"
fi

for ABI in "${ABIS[@]}"; do
  echo "-- Building ${ABI}"
  cmake -S "$HERE" -B "$BUILD_ROOT/$ABI" \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DANDROID_ABI="$ABI" \
    -DANDROID_PLATFORM="android-$MIN_SDK" \
    -DCMAKE_BUILD_TYPE=MinSizeRel \
    -DTAGLIB_DIR="$TAGLIB_DIR" \
    -Wno-dev >/dev/null
  cmake --build "$BUILD_ROOT/$ABI" --target audiotagger -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)" >/dev/null

  mkdir -p "$OUT_DIR/$ABI"
  cp "$BUILD_ROOT/$ABI/libaudiotagger.so" "$OUT_DIR/$ABI/libaudiotagger.so"
  "$NDK/toolchains/llvm/prebuilt/"*/bin/llvm-strip --strip-unneeded "$OUT_DIR/$ABI/libaudiotagger.so"
  echo "   $(du -h "$OUT_DIR/$ABI/libaudiotagger.so" | cut -f1)  $ABI"
done

echo
echo "Done. Vendored libraries:"
ls -la "$OUT_DIR"/*/libaudiotagger.so | awk '{print "  " $5 " bytes  " $9}'
