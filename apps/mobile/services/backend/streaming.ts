import { isJellyfin } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/streaming";

export function jellyfinStreamUrl(id: string): string {
  return J.streamUrl(id);
}

export function jellyfinHlsStreamUrl(id: string): string {
  return J.hlsStreamUrl(id);
}

export function jellyfinDownloadUrl(id: string): string {
  return J.downloadUrl(id);
}

export function jellyfinArtworkUrl(id?: string, size?: number): string {
  return J.artworkUrl(id, size);
}

export { isJellyfin };
