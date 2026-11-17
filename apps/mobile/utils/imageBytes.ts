// Shared by every path that saves a downloaded image to disk. A server behind an
// authenticating proxy, an expired session, or a CDN having a bad day all answer
// with an HTML error page rather than an image; written under an image filename
// that file has a path, so the UI renders an <Image> for it, but every decoder
// rejects it — the "cover shows in the app but colour extraction fails" symptom.
// Size alone doesn't catch it (those pages can be large), so sniff the magic.
const IMAGE_MAGIC: readonly (readonly number[])[] = [
  [0xff, 0xd8, 0xff], // JPEG
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0x47, 0x49, 0x46, 0x38], // GIF
  [0x52, 0x49, 0x46, 0x46], // RIFF container (WebP)
];

export function looksLikeImage(bytes: Uint8Array): boolean {
  return IMAGE_MAGIC.some((magic) =>
    magic.every((byte, index) => bytes[index] === byte),
  );
}

const HEIF_BRANDS = new Set([
  "avif",
  "avis",
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
]);

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

// Wider than looksLikeImage, which guards what expo-image renders: this is what
// the OS decoders (BitmapFactory, UIImage) read too. Radio station favicons are
// often ICO or BMP.
export function looksLikePlatformImage(bytes: Uint8Array): boolean {
  if (looksLikeImage(bytes)) return true;
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    return true;
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return true;
  return (
    bytes.length >= 12 &&
    ascii(bytes, 4, 8) === "ftyp" &&
    HEIF_BRANDS.has(ascii(bytes, 8, 12))
  );
}
