import { File, Paths } from "expo-file-system";
import { createArtworkMirror } from "@/services/artworkMirror";
import { LOCK_SCREEN_PLACEHOLDER_PNG_BASE64 } from "@/services/lockScreenPlaceholderPng";

// Local mirror of the now-playing cover for the OS media controls. See
// services/artworkMirror.ts for why the native fetch can't be authenticated and
// why a local file solves every variant of it at once.
//
// Deliberately not solved by patching expo-audio: the header case is only one of
// three auth mechanisms that native fetch can't satisfy, and a local file fixes
// all of them at once without another native patch to carry across upgrades.
//
// Bounded because it's one file per distinct cover URL, and shuffling a large
// library touches a lot of them. The car mirror is a separate instance with its
// own (larger) cap, so browsing in Android Auto can't evict the cover the
// notification is currently showing.
const mirror = createArtworkMirror("lockscreen-artwork", 128);

export const cachedArtworkUri = mirror.cachedArtworkUri;
export const ensureArtworkCached = mirror.ensureArtworkCached;
export const refreshArtworkIndex = mirror.refreshIndex;
// Registered as a logout handler in services/player.ts.
export const clearArtworkCache = mirror.clearArtworkCache;

const PLACEHOLDER_NAME = "lockscreen-placeholder.png";
let placeholder: File | null = null;

// Some lock screens keep the previous track's cover when the metadata carries
// none (#287). Staged and moved into place, so a write cut short never leaves a
// file that passes the `exists` check, which stays per call: the OS may clear
// the cache directory.
export function lockScreenPlaceholderUri(): string | undefined {
  try {
    placeholder ??= new File(Paths.cache, PLACEHOLDER_NAME);
    if (!placeholder.exists) {
      const staged = new File(Paths.cache, `${PLACEHOLDER_NAME}.tmp`);
      staged.create({ overwrite: true });
      staged.writeSync(LOCK_SCREEN_PLACEHOLDER_PNG_BASE64, {
        encoding: "base64",
      });
      staged.moveSync(placeholder, { overwrite: true });
    }
    return placeholder.uri;
  } catch {
    return undefined;
  }
}
