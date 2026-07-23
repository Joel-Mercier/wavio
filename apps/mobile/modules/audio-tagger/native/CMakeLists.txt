cmake_minimum_required(VERSION 3.22)

project(audiotagger CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# TAGLIB_DIR is the checkout made by build.sh (pinned tag, not vendored in git).
if(NOT DEFINED TAGLIB_DIR)
  message(FATAL_ERROR "TAGLIB_DIR must point at a taglib checkout")
endif()

# Size matters more than breadth here: this ships in an APK, per ABI. Formats the
# local library can actually contain are kept; trackers, Shorten and the bindings
# are not. Static so there's exactly one .so to vendor.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(BUILD_BINDINGS OFF CACHE BOOL "" FORCE)
set(VISIBILITY_HIDDEN ON CACHE BOOL "" FORCE)
set(WITH_MOD OFF CACHE BOOL "" FORCE)
set(WITH_SHORTEN OFF CACHE BOOL "" FORCE)
set(WITH_ZLIB OFF CACHE BOOL "" FORCE)

set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Os -fvisibility=hidden -ffunction-sections -fdata-sections")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Os -fvisibility=hidden -fvisibility-inlines-hidden -ffunction-sections -fdata-sections")
set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -Wl,--gc-sections -Wl,--exclude-libs,ALL -s")

add_subdirectory(${TAGLIB_DIR} taglib-build EXCLUDE_FROM_ALL)

add_library(audiotagger SHARED tagger.cpp)

target_include_directories(audiotagger PRIVATE
  ${TAGLIB_DIR}
  ${TAGLIB_DIR}/taglib
  ${TAGLIB_DIR}/taglib/toolkit
  ${CMAKE_BINARY_DIR}/taglib-build
)

# `tag` is TagLib's static library target. Nothing from it is re-exported: the
# shim's single JNI entry point is the only visible symbol.
target_link_libraries(audiotagger PRIVATE tag)
