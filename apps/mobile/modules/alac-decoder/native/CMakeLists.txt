cmake_minimum_required(VERSION 3.22)

project(wavioalac C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# FFMPEG_PREFIX is the per-ABI `make install` output of build.sh: static
# libavcodec / libswresample / libavutil plus their headers.
if(NOT DEFINED FFMPEG_PREFIX)
  message(FATAL_ERROR "FFMPEG_PREFIX must point at an FFmpeg install prefix")
endif()

foreach(ffmpeg_lib avcodec swresample avutil)
  add_library(${ffmpeg_lib} STATIC IMPORTED)
  set_target_properties(${ffmpeg_lib} PROPERTIES
    IMPORTED_LOCATION ${FFMPEG_PREFIX}/lib/lib${ffmpeg_lib}.a)
endforeach()

set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Os -fvisibility=hidden -fvisibility-inlines-hidden -ffunction-sections -fdata-sections")
# See audio-tagger/native/CMakeLists.txt for why max-page-size is set here
# rather than left to the NDK default.
set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -Wl,--gc-sections -Wl,--exclude-libs,ALL -Wl,-z,max-page-size=16384 -s")

add_library(wavioalac SHARED ffmpeg_jni.cc)

target_include_directories(wavioalac PRIVATE ${FFMPEG_PREFIX}/include)

find_library(android_log_lib log)

target_link_libraries(wavioalac PRIVATE swresample avcodec avutil ${android_log_lib})

# Required for arm64-v8a since NDK r23 (androidx/media decoder_ffmpeg CMakeLists).
if(ANDROID_ABI STREQUAL "arm64-v8a")
  target_link_options(wavioalac PRIVATE "-Wl,-Bsymbolic")
endif()
