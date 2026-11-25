import { useCapabilities } from "@/hooks/useCapabilities";
import { isCastRelayAvailable } from "@/services/castRelay";
import { hostedElsewhere } from "@/services/playback/castMime";
import useQueue from "@/stores/queue";

// Casting of any kind needs a URL the receiver can fetch. The music backend
// gives one for its own tracks; where it can't (a library on this phone or a
// share, a server behind single sign-on), this phone serves the track itself
// where it can (services/castRelay.ts). Radio, podcasts and audiobooks stream
// from wherever they are hosted, which any receiver can reach.
export function useCanCast(): boolean {
  const capabilities = useCapabilities();
  const currentHostedElsewhere = useQueue((s) => {
    const track = s.currentIndex == null ? null : s.queue[s.currentIndex];
    return !!track && hostedElsewhere(track);
  });
  return (
    capabilities.remoteStreamableUrl ||
    isCastRelayAvailable() ||
    currentHostedElsewhere
  );
}
