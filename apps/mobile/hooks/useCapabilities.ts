import { useMemo } from "react";
import {
  type BackendCapabilities,
  getCapabilities,
  sessionCapabilityOverrides,
} from "@/services/backend/capabilities";
import useAuth from "@/stores/auth";
import {
  activeOverrides,
  useCapabilityOverridesBase,
} from "@/stores/capabilityOverrides";

export function useCapabilities(): BackendCapabilities {
  const serverType = useAuth((s) => s.serverType);
  const authMethod = useAuth((s) => s.authMethod);
  const disabledAt = useCapabilityOverridesBase((s) => s.disabledAt);
  return useMemo(
    () => ({
      ...getCapabilities(serverType),
      ...sessionCapabilityOverrides(authMethod),
      ...activeOverrides(disabledAt),
    }),
    [serverType, authMethod, disabledAt],
  );
}
