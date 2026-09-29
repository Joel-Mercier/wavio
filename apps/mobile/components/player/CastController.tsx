import { CastButton } from "react-native-google-cast";
import { Box } from "@/components/ui/box";
import { useCapabilities } from "@/hooks/useCapabilities";

// The native Cast dialog can only be opened by proxying a click to a
// MediaRouteButton that is currently attached to the window
// (RNGCCastContext.showCastDialog → RNGoogleCastButtonManager.getCurrent), and
// it resolves false rather than throwing when there is none — so with no button
// mounted anywhere, every Chromecast tap silently does nothing (issue #177).
// This button is parked off-screen: never seen, always attached. It also
// initialises the Cast SDK on launch and keeps its passive device discovery
// running, which otherwise waits for the first discovery pass.
//
// Nothing else lives here: the session itself is driven by services/cast.ts,
// outside the React tree, so it survives every screen unmounting.
export default function CastController() {
  const capabilities = useCapabilities();

  // Same gate as the sheet's Chromecast row: a backend whose tracks no receiver
  // can fetch has nothing to cast, so it gets no button and no discovery.
  if (!capabilities.remoteStreamableUrl) return null;

  return (
    <Box
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ position: "absolute", left: -9999, width: 24, height: 24 }}
    >
      <CastButton style={{ width: 24, height: 24 }} />
    </Box>
  );
}
