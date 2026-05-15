import {
  type BackendCapabilities,
  getCapabilities,
} from "@/services/backend/capabilities";
import useAuth from "@/stores/auth";

export function useCapabilities(): BackendCapabilities {
  const serverType = useAuth((s) => s.serverType);
  return getCapabilities(serverType);
}
