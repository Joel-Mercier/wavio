import { songsExist } from "@/services/backend/browsing";
import { getOpenSubsonicExtensions } from "@/services/backend/system";
import { reportError } from "@/services/errorReporting";
import { probeCandidates } from "@/services/navidromeIdMigration/detect";
import { applyCanonicalIdRemap } from "@/services/navidromeIdMigration/remap";
import { getIsEffectivelyOnline } from "@/services/network";
import { drainOfflineMutations } from "@/services/offlineMutations/replay";
import type { OpenSubsonicExtensions } from "@/services/openSubsonic/types";
import useLibrarySync from "@/stores/librarySync";
import { useServerExtensionsBase } from "@/stores/serverExtensions";
import { canonicalId } from "@/utils/navidromeCanonicalId";

export { noteServerVersion } from "@/services/navidromeIdMigration/detect";
export { applyCanonicalIdRemap } from "@/services/navidromeIdMigration/remap";

let inFlight = false;

export function __resetIdMigrationState() {
  inFlight = false;
  completedListeners.clear();
}

export type IdMigrationCompletedResult = { remappedCount: number };

/**
 * The offline-mutation drain bails out early while the freeze is on, without
 * arming a retry: a backoff timer that fired during the freeze ends the chain,
 * and nothing else wakes the queue until the next reconnect or new mutation.
 * Kick it once the freeze lifts, whichever way the probe went.
 */
function drainAfterSettling(): void {
  void drainOfflineMutations();
}

const completedListeners = new Set<
  (result: IdMigrationCompletedResult) => void
>();

/** The service can't render UI; the root controller surfaces this as a toast. */
export function subscribeIdMigrationCompleted(
  cb: (result: IdMigrationCompletedResult) => void,
): () => void {
  completedListeners.add(cb);
  return () => {
    completedListeners.delete(cb);
  };
}

// Navidrome merged the canonical-id migration (#5824, f853ca6) directly on top
// of the topSongsByArtistId extension (#5853, b40b415) — b40b415 is literally
// f853ca6's parent commit. So a build that doesn't advertise the extension
// predates the renumbering, which makes a missing extension conclusive proof
// that this server has NOT migrated. The converse does not hold: a develop image
// cut from b40b415 itself advertises the extension without the migration. The
// extension therefore only ever rules the migration *out* — confirming it stays
// the differential probe's job, which is also what validates our port of the
// transform against the live server.
const MIGRATION_ERA_EXTENSION = "topSongsByArtistId";

/**
 * Whether the server proved it predates the migration, asked fresh rather than
 * read from `stores/serverExtensions`: that store is refreshed through a query
 * with a 5-minute staleTime, so an upgrade performed while the app is
 * foregrounded would still be answered from the *pre*-upgrade list — exactly
 * the case this must not get wrong.
 *
 * Anything short of proof answers `false` and falls through to the probe: a
 * failed request, or a list we can't distinguish from a malformed response.
 */
async function serverPredatesMigration(): Promise<boolean> {
  let extensions: OpenSubsonicExtensions[] | undefined;
  try {
    extensions = (await getOpenSubsonicExtensions()).openSubsonicExtensions;
  } catch {
    return false;
  }
  // An empty list can't be told apart from a server that answered with nothing
  // useful; only a populated one proves the endpoint really reported.
  if (!extensions || extensions.length === 0) return false;
  useServerExtensionsBase.getState().setExtensions(extensions);
  return !extensions.some((e) => e.name === MIGRATION_ERA_EXTENSION);
}

/**
 * Confirms (or refutes) Navidrome's canonical-id migration, then repairs.
 *
 * The probe is differential: for each sampled id it asks the server about both
 * the stored id and the id our transform computes from it. "Old gone, computed
 * present" both proves the server renumbered AND validates our port of the
 * transform against the live server — so if the codec were wrong, or upstream
 * changed it before the PR merged, the computed id simply wouldn't resolve and
 * we abort rather than rewriting every stored id to garbage.
 *
 * `serverPredatesMigration` short-circuits ahead of it, but only ever in the
 * negative direction: it can end the freeze, never start a remap.
 */
export async function runIdMigrationCheck(): Promise<void> {
  if (inFlight) return;
  if (useLibrarySync.getState().idMigration !== "checking") return;
  if (!getIsEffectivelyOnline()) return;

  const candidates = probeCandidates();
  if (candidates.length === 0) {
    // Every id we hold is already canonical: nothing can tell us whether the
    // server migrated, and nothing needs repairing either.
    useLibrarySync
      .getState()
      .setIdMigration({ idMigration: "idle", lastProbedAt: Date.now() });
    drainAfterSettling();
    return;
  }

  inFlight = true;
  try {
    // One request that settles the common case — an ordinary point-release bump
    // — instead of two per sample, and it answers definitively where a probe
    // whose requests all go unanswered would leave us frozen indefinitely.
    if (await serverPredatesMigration()) {
      useLibrarySync
        .getState()
        .setIdMigration({ idMigration: "idle", lastProbedAt: Date.now() });
      drainAfterSettling();
      return;
    }

    const computed = await Promise.all(candidates.map((id) => canonicalId(id)));
    const { present, gone } = await songsExist([...candidates, ...computed]);
    const isPresent = new Set(present);
    const isGone = new Set(gone);

    let confirmed = 0;
    let refuted = 0;
    let inconclusive = 0;
    for (const [index, oldId] of candidates.entries()) {
      if (isPresent.has(oldId)) refuted++;
      else if (!isGone.has(oldId)) inconclusive++;
      else if (isPresent.has(computed[index])) confirmed++;
      else if (!isGone.has(computed[index])) inconclusive++;
    }

    // A surviving old id means the server still speaks the ids we hold.
    // Otherwise require corroboration: one hit is already strong evidence (the
    // computed id is a deterministic function of the old one, so it resolving
    // is no accident), two makes coincidence implausible.
    const needed = candidates.length === 1 ? 1 : 2;
    // songsExist never throws on a transport failure or 5xx — it leaves the id
    // unclassified. With samples still unanswered and nothing proven either
    // way, unfreezing would read "we couldn't ask" as "the server didn't
    // migrate", and the version is already recorded so detection would never
    // fire again. Stay frozen and re-probe on the next foreground / reconnect.
    if (refuted === 0 && confirmed < needed && inconclusive > 0) return;
    if (refuted > 0 || confirmed < needed) {
      useLibrarySync
        .getState()
        .setIdMigration({ idMigration: "idle", lastProbedAt: Date.now() });
      drainAfterSettling();
      return;
    }

    const remappedCount = await applyCanonicalIdRemap();
    useLibrarySync
      .getState()
      .setIdMigration({ idMigration: "migrated", lastProbedAt: Date.now() });
    drainAfterSettling();
    for (const cb of completedListeners) cb({ remappedCount });
  } catch (error) {
    // Stay frozen: a probe that failed proves nothing, and unfreezing would let
    // the reconcilers loose on ids we haven't verified. Retried on the next
    // foreground / reconnect via LibrarySyncController.
    reportError(error, { area: "storage", endpoint: "navidrome id migration" });
  } finally {
    inFlight = false;
  }
}
