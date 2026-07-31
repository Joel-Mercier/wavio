import { useQuery } from "@tanstack/react-query";
import { SOULSYNC_NETWORK_MODE } from "@/hooks/soulsync/networkMode";
import { fetchSystemStatus } from "@/services/soulsync/auth";
import useSoulSync from "@/stores/soulsync";

// SoulSync answers /system/status fine without its Soulseek (slskd) backend, so
// a connection that looks healthy can still be unable to fetch anything. The
// config screen keys its warning off this.
export function useSoulSyncStatus() {
  const isConnected = useSoulSync((store) => store.isConnected);
  return useQuery({
    queryKey: ["soulsync", "status"],
    queryFn: fetchSystemStatus,
    enabled: isConnected,
    networkMode: SOULSYNC_NETWORK_MODE,
    staleTime: 1000 * 60,
  });
}
