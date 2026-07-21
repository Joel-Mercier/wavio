import { requireOptionalNativeModule } from "expo";

// Android-only tag writer backed by TagLib (see native/tagger.cpp). The module
// is optional on purpose: iOS has no implementation, and an ABI without the
// prebuilt library must degrade to "unavailable" rather than crash.
type AudioTaggerNative = {
  isAvailable: () => boolean;
  writeTags: (uri: string, tagsJson: string) => Promise<void>;
};

const NativeAudioTagger =
  requireOptionalNativeModule<AudioTaggerNative>("AudioTagger");

/**
 * Whether tags can actually be written into files on this device.
 *
 * Checks more than the module's presence: the native library is vendored per
 * ABI, so a device whose ABI has no `libaudiotagger.so` has the module but
 * cannot write. The module answers for itself.
 */
export function isAudioTaggerAvailable(): boolean {
  try {
    return NativeAudioTagger?.isAvailable() ?? false;
  } catch {
    return false;
  }
}

/** Write tags into the file at `uri`. Rejects if the file can't be tagged. */
export async function writeTags(uri: string, tags: object): Promise<void> {
  if (!NativeAudioTagger) {
    throw new Error("AudioTagger native module is unavailable");
  }
  await NativeAudioTagger.writeTags(uri, JSON.stringify(tags));
}
