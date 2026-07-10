import type { TFunction } from "i18next";

export function formatReleaseTypes(
  releaseTypes: string[],
  t: TFunction,
): string {
  return releaseTypes.map((type) => translateReleaseType(type, t)).join(" · ");
}

function translateReleaseType(type: string, t: TFunction): string {
  const key = type
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");
  const fallback =
    type.toLowerCase() === "ep"
      ? type.toUpperCase()
      : type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  return t(`app.albums.releaseTypes.${key}`, { defaultValue: fallback });
}
