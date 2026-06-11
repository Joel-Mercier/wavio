import { useQuery } from "@tanstack/react-query";
import { queryLibrarySize } from "@/services/local/repository";
import { useAuthBase } from "@/stores/auth";

// Total on-disk size (bytes) of the imported local library, read from the
// SQLite index. Only meaningful for the local backend, so the query is disabled
// for streaming servers (there is no local index then). Returns 0 until loaded.
// The cache is invalidated after a rescan (see LocalLibraryIndexing), so this
// re-reads once newly indexed files change the total.
export const useLocalLibrarySize = (): number => {
  const isLocal = useAuthBase((s) => s.serverType === "local");
  const { data } = useQuery({
    queryKey: ["localLibrarySize"],
    queryFn: queryLibrarySize,
    enabled: isLocal,
  });
  return data ?? 0;
};
