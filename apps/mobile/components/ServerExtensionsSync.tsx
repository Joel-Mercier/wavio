import { useEffect } from "react";
import { useGetOpenSubsonicExtensions } from "@/hooks/backend/useSystem";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useServerExtensionsBase } from "@/stores/serverExtensions";

// Mounted once inside the authenticated layout. Mirrors the active server's
// advertised OpenSubsonic extensions into the (non-persisted) serverExtensions
// store so non-React consumers (services/player.ts, services/similarSongs.ts)
// can synchronously gate behaviour on extension availability. The store is
// reset on server switch in app/(app)/_layout.tsx.
export default function ServerExtensionsSync() {
  const isOnline = useIsOnline();
  const { data } = useGetOpenSubsonicExtensions();
  const extensions = data?.openSubsonicExtensions;

  useEffect(() => {
    if (!isOnline || !extensions) return;
    useServerExtensionsBase.getState().setExtensions(extensions);
  }, [isOnline, extensions]);

  return null;
}
