import { createArtworkMirror } from "@/services/artworkMirror";

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
// Registered as a logout handler in services/player.ts.
export const clearArtworkCache = mirror.clearArtworkCache;
