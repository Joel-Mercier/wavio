import { audioMuseRequest } from "@/services/audioMuse";
import type {
  AudioMuseAnchor,
  AudioMuseAnchorsResponse,
} from "@/services/audioMuse/types";

// Alchemy anchors: named points in the embedding space the user saved from
// AudioMuse's own web UI. They are a seed both the song path and the similarity
// search accept, which is why they live here rather than under either one.

/**
 * The saved anchors this deployment holds. Stored deployment-wide, so most
 * installs have none — an empty list is the normal case and callers hide the
 * option. A database failure answers 500 with an empty list beside the error,
 * which is the same outcome.
 */
export async function listAnchors(): Promise<AudioMuseAnchor[]> {
  const rsp = await audioMuseRequest<AudioMuseAnchorsResponse>("/api/anchors", {
    // Anchors are raw vectors held once per deployment, not per media server.
    skipServerScope: true,
    notFoundIsExpected: true,
  });

  return (rsp?.anchors ?? []).filter(
    (anchor) => typeof anchor?.id === "number",
  );
}
