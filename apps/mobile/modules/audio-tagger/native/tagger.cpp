#include <jni.h>

// Source-tree layout (taglib/ and taglib/toolkit/ are on the include path), not
// the flattened <taglib/...> layout that only exists after an install.
#include <fileref.h>
#include <tbytevector.h>
#include <tfile.h>
#include <tfilestream.h>
#include <tlist.h>
#include <tpropertymap.h>
#include <tvariant.h>

// JNI shim over TagLib. Kept deliberately thin: everything format-specific is
// TagLib's job, and everything policy-related (which fields, which files) is
// decided in TypeScript. This layer only moves a property map across the bridge.
//
// Ownership: TagLib::FileStream(int) calls fdopen() on the descriptor and its
// destructor calls fclose(), which closes the underlying fd. The descriptor is
// therefore *handed over* by Kotlin (via ParcelFileDescriptor.detachFd) and must
// not be closed on the Kotlin side — doing so would be a double close.

namespace {

// TagLib's picture-type strings are matched exactly and an unrecognised value
// silently degrades to "Other" (see toolkit/tpicturetype.cpp), so this string
// is not cosmetic.
constexpr const char *kFrontCover = "Front Cover";

// Attaches a front cover via the format-agnostic complex-property API, which
// TagLib translates into APIC for ID3v2, a PICTURE block for FLAC, `covr` for
// MP4, METADATA_BLOCK_PICTURE for Xiph, and so on.
void setFrontCover(TagLib::File *file, const TagLib::ByteVector &data,
                   const TagLib::String &mimeType) {
  TagLib::VariantMap picture;
  picture.insert("data", TagLib::Variant(data));
  picture.insert("mimeType", TagLib::Variant(mimeType));
  picture.insert("description", TagLib::Variant(TagLib::String(kFrontCover)));
  picture.insert("pictureType", TagLib::Variant(TagLib::String(kFrontCover)));

  TagLib::List<TagLib::VariantMap> pictures;
  pictures.append(picture);
  file->setComplexProperties("PICTURE", pictures);
}

}  // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_expo_modules_audiotagger_TagLibBridge_writeTags(
    JNIEnv *env, jobject /* thiz */, jint fd, jobjectArray keys,
    jobjectArray values, jbyteArray pictureData, jstring pictureMime) {
  // Takes ownership of fd; closed when the stream goes out of scope.
  TagLib::FileStream stream(fd, false);
  if (!stream.isOpen() || stream.readOnly()) {
    return JNI_FALSE;
  }

  // Type is detected from the stream's content rather than a filename, because
  // a Storage Access Framework descriptor has no path to inspect.
  TagLib::FileRef ref(&stream, true, TagLib::AudioProperties::Average);
  if (ref.isNull() || ref.file() == nullptr || !ref.file()->isValid()) {
    return JNI_FALSE;
  }

  TagLib::PropertyMap properties = ref.file()->properties();

  const jsize count = env->GetArrayLength(keys);
  for (jsize i = 0; i < count; i++) {
    auto key = static_cast<jstring>(env->GetObjectArrayElement(keys, i));
    auto value = static_cast<jstring>(env->GetObjectArrayElement(values, i));
    if (key == nullptr || value == nullptr) {
      continue;
    }

    const char *keyChars = env->GetStringUTFChars(key, nullptr);
    const char *valueChars = env->GetStringUTFChars(value, nullptr);
    if (keyChars != nullptr && valueChars != nullptr) {
      properties.replace(TagLib::String(keyChars, TagLib::String::UTF8),
                         TagLib::StringList(TagLib::String(
                             valueChars, TagLib::String::UTF8)));
    }
    if (keyChars != nullptr) env->ReleaseStringUTFChars(key, keyChars);
    if (valueChars != nullptr) env->ReleaseStringUTFChars(value, valueChars);

    // The local reference table is small and fixed-size; a long tag list would
    // exhaust it without these.
    env->DeleteLocalRef(key);
    env->DeleteLocalRef(value);
  }

  // Properties TagLib can't express in the target format come back here. They're
  // ignored deliberately: dropping an unsupported field is better than failing
  // the whole write, and the app-side override still carries the value.
  ref.file()->setProperties(properties);

  if (pictureData != nullptr) {
    const jsize length = env->GetArrayLength(pictureData);
    jbyte *bytes = env->GetByteArrayElements(pictureData, nullptr);
    if (bytes != nullptr) {
      if (length > 0) {
        const TagLib::ByteVector data(reinterpret_cast<const char *>(bytes),
                                      static_cast<unsigned int>(length));
        TagLib::String mime("image/jpeg", TagLib::String::UTF8);
        if (pictureMime != nullptr) {
          if (const char *mimeChars =
                  env->GetStringUTFChars(pictureMime, nullptr)) {
            mime = TagLib::String(mimeChars, TagLib::String::UTF8);
            env->ReleaseStringUTFChars(pictureMime, mimeChars);
          }
        }
        setFrontCover(ref.file(), data, mime);
      }
      // JNI_ABORT: the buffer was never modified, so there's nothing to copy
      // back into the Java array.
      env->ReleaseByteArrayElements(pictureData, bytes, JNI_ABORT);
    }
  }

  return ref.file()->save() ? JNI_TRUE : JNI_FALSE;
}
