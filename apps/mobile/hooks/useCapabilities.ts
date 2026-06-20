import { useMemo } from "react";
import {
  type BackendCapabilities,
  getCapabilities,
} from "@/services/backend/capabilities";
import useAuth from "@/stores/auth";
import { useCapabilityOverridesBase } from "@/stores/capabilityOverrides";

export function useCapabilities(): BackendCapabilities {
  const serverType = useAuth((s) => s.serverType);
  const overrides = useCapabilityOverridesBase((s) => s.overrides);
  return useMemo(
    () => ({ ...getCapabilities(serverType), ...overrides }),
    [serverType, overrides],
  );
}
