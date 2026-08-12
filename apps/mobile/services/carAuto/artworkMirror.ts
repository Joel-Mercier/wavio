import { createArtworkMirror } from "@/services/artworkMirror";

// Cover size requested for the car. The browse tree used to ask for the
// original file (no `size` param at all), which meant a full-resolution cover
// per grid tile — several MB each on a well-tagged library. 600 matches what the
// offline library sync caches and is comfortably above the largest tile a head
// unit renders.
export const CAR_ARTWORK_SIZE = 600;

// How many distinct covers one tree build is allowed to mirror. At this size a
// cover is ~40-60KB, so the cap bounds the cache at roughly 10-15MB and the
// first build at a few hundred requests. Covers past the cap keep their remote
// URL, which is exactly today's behaviour — degraded, never worse.
export const CAR_ARTWORK_BUDGET = 300;

// Its own directory and cap, deliberately not shared with the lock screen's:
// the two request different sizes of the same cover and the cache key ignores
// the size, so one directory would let a browse-tree build overwrite the
// full-size cover the notification is showing (and evict it, given how many more
// entries the tree touches).
const mirror = createArtworkMirror("car-artwork", CAR_ARTWORK_BUDGET + 100);

export const cachedCarArtwork = mirror.cachedArtworkUri;
export const ensureCarArtwork = mirror.ensureArtworkCached;
export const clearCarArtworkCache = mirror.clearArtworkCache;
