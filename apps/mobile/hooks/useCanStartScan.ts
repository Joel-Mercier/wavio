import { useCapabilities } from "@/hooks/useCapabilities";
import { useAuthBase } from "@/stores/auth";

// Whether the active backend can run a library scan for this user. Mirrors the
// gating of the manual "Scan library" action (MusicLibrarySection): the backend
// must support scanning, and Navidrome restricts it to admins (code 50
// otherwise). Used to gate the Lidarr auto-scan-on-download-finish feature.
export function useCanStartScan(): boolean {
  const capabilities = useCapabilities();
  const serverType = useAuthBase((s) => s.serverType);
  const hasNavidromeNative = useAuthBase((s) => s.hasNavidromeNative);
  const isAdmin = useAuthBase((s) => s.isAdmin);
  const scanRequiresAdmin =
    serverType === "navidrome" && hasNavidromeNative && !isAdmin;
  return capabilities.libraryScan && !scanRequiresAdmin;
}
