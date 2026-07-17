import { songsExist } from "@/services/backend/browsing";
import { getIsEffectivelyOnline } from "@/services/network";
import usePlayHistory from "@/stores/playHistory";

// Play history holds client-side snapshots, so a track deleted server-side
// would linger and fail to play. This prunes those entries — but only ever on
// the server explicitly reporting the id missing (Subsonic code 70 / a Jellyfin
// omission / a pruned local row). An unreachable server proves nothing, and
// effective-online lags a real drop by ~24s, so a pass that dies mid-way
// classifies the rest as unknown and removes nothing.

const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REVERIFY_AFTER_MS = 24 * 60 * 60 * 1000;
// Subsonic spends one request per id, so cap the work per pass; entries not
// reached this time are picked up by later ones.
const MAX_IDS_PER_PASS = 25;

let lastRunAt: number | null = null;
let inFlight = false;

export function __resetPlayHistoryReconcile() {
  lastRunAt = null;
  inFlight = false;
}

export async function reconcilePlayHistory(): Promise<void> {
  if (inFlight) return;
  if (!getIsEffectivelyOnline()) return;
  const now = Date.now();
  if (lastRunAt != null && now - lastRunAt < RUN_INTERVAL_MS) return;

  const stale = usePlayHistory
    .getState()
    .history.filter(
      (entry) =>
        entry.verifiedAt == null || now - entry.verifiedAt >= REVERIFY_AFTER_MS,
    )
    .slice(0, MAX_IDS_PER_PASS)
    .map((entry) => entry.id);
  if (stale.length === 0) return;

  inFlight = true;
  lastRunAt = now;
  try {
    const { present, gone } = await songsExist(stale);
    usePlayHistory.getState().removeIds(gone);
    usePlayHistory.getState().markVerified(present, Date.now());
  } catch {
    // Best-effort: a failed probe leaves history exactly as it was. Retried on
    // the next pass, so there is nothing to report.
  } finally {
    inFlight = false;
  }
}
