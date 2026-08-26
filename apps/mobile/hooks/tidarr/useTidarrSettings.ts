import { useQuery } from "@tanstack/react-query";
import { TIDARR_NETWORK_MODE } from "@/hooks/tidarr/networkMode";
import { fetchSettings } from "@/services/tidarr/auth";
import useTidarr from "@/stores/tidarr";

// The instance's own configuration: whether a Tidal account is linked
// (`noToken`), whether quality is pinned (`LOCK_QUALITY`) and what it defaults
// to. Read by the config screen; cheap enough to refetch on focus.
export function useTidarrSettings() {
  const isConnected = useTidarr((store) => store.isConnected);
  return useQuery({
    queryKey: ["tidarr", "settings"],
    queryFn: fetchSettings,
    enabled: isConnected,
    networkMode: TIDARR_NETWORK_MODE,
    staleTime: 1000 * 60,
  });
}
