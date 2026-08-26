// Tidal cover/picture ids are UUIDs whose dashes become path separators on the
// CDN. The CDN needs no auth, so covers load directly rather than through
// Tidarr's proxy.
const TIDAL_RESOURCES = "https://resources.tidal.com/images";

function resourceUrl(id: string | null | undefined, size: number) {
  if (!id) return undefined;
  return `${TIDAL_RESOURCES}/${id.replace(/-/g, "/")}/${size}x${size}.jpg`;
}

export function tidalCoverUrl(
  cover: string | null | undefined,
  size = 320,
): string | undefined {
  return resourceUrl(cover, size);
}

export function tidalPictureUrl(
  picture: string | null | undefined,
  size = 320,
): string | undefined {
  return resourceUrl(picture, size);
}
