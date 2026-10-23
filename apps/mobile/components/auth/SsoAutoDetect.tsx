import { useEffect } from "react";
import { useSsoDiscovery } from "@/hooks/useSsoDiscovery";

/**
 * Reports whether the server at `url` publishes single sign-on. Renders
 * nothing: it exists so the login form's render props can run the lookup.
 */
export default function SsoAutoDetect({
  url,
  headers,
  onResult,
}: {
  url: string;
  headers?: Record<string, string>;
  onResult: (issuerHost: string | null) => void;
}) {
  const host = useSsoDiscovery(url, headers);
  // biome-ignore lint/correctness/useExhaustiveDependencies: report each new answer once
  useEffect(() => {
    if (host !== undefined) onResult(host);
  }, [host]);
  return null;
}
