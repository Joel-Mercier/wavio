import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { SOULSYNC_NETWORK_MODE } from "@/hooks/soulsync/networkMode";
import { fetchSystemStatus } from "@/services/soulsync/auth";
import useSoulSync from "@/stores/soulsync";

// A rejected API key is not transient: retrying only re-asks a server that will
// keep saying no, three more times per mount.
function isRejectedKey(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

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
    retry: (failureCount, error) => !isRejectedKey(error) && failureCount < 3,
  });
}
