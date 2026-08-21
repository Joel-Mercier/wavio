import { useMemo } from "react";
import {
  type BackendCapabilities,
  getCapabilities,
} from "@/services/backend/capabilities";
import useAuth from "@/stores/auth";
import {
  activeOverrides,
  useCapabilityOverridesBase,
} from "@/stores/capabilityOverrides";

export function useCapabilities(): BackendCapabilities {
  const serverType = useAuth((s) => s.serverType);
  const disabledAt = useCapabilityOverridesBase((s) => s.disabledAt);
  return useMemo(
    () => ({ ...getCapabilities(serverType), ...activeOverrides(disabledAt) }),
    [serverType, disabledAt],
  );
}
