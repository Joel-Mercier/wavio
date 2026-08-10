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
