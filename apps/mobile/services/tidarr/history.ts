import { tidarrRequest } from "@/services/tidarr";

// Tidarr's history is a bare list of item ids (and only kept when the instance
// runs with ENABLE_HISTORY=true). Too thin for a history screen, enough to mark
// a search result as already downloaded.
export async function fetchDownloadedIds(): Promise<string[]> {
  const ids = await tidarrRequest<string[]>("/history/list", {
    unauthorizedIsExpected: true,
  });
  return Array.isArray(ids) ? ids.map(String) : [];
}
