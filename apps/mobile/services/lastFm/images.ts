/**
 * Picks a usable cover-art URL out of a Last.fm `image` array.
 *
 * Two traps live here. The first is that since 2019 Last.fm serves the *same*
 * grey star placeholder for every artist image, so an artist row rendered from
 * this array shows a wall of identical squares — hence artist artwork is never
 * asked for at all, and this filter catches the placeholder wherever else it
 * turns up (an album with no art gets it too). The second is that the array
 * always has five entries even when every one of them is an empty string.
 */
const PLACEHOLDER_HASH = "2a96cbd8b46e442fc41c2b86b821562f";

export type LastFmImage = { "#text"?: string; size?: string };

// Largest first; `mega` is only present on some entities.
const PREFERRED_SIZES = ["extralarge", "large", "mega", "medium", "small"];

export const pickImageUrl = (
  images: LastFmImage | LastFmImage[] | undefined,
): string | undefined => {
  const list =
    images === undefined ? [] : Array.isArray(images) ? images : [images];
  const usable = list.filter((image) => {
    const url = image?.["#text"]?.trim();
    return !!url && !url.includes(PLACEHOLDER_HASH);
  });
  if (usable.length === 0) return undefined;
  for (const size of PREFERRED_SIZES) {
    const hit = usable.find((image) => image.size === size);
    if (hit) return hit["#text"]?.trim();
  }
  return usable[usable.length - 1]["#text"]?.trim();
};
