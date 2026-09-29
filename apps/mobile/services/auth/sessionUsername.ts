import { getAuthScope } from "@/config/authScope";
import { storage } from "@/config/storage";
import { hasCaseInsensitiveUsernamesType } from "@/services/backend/serverTraits";
import type { ServerType } from "@/stores/servers";

// The storage scope is derived from the username as typed (config/authScope.ts),
// so on a server that matches usernames case-insensitively, signing in as `joel`
// after using `Joel` opened an empty scope: same account, but its downloads,
// queue and cache all looked gone. Instead of changing the scope formula (which
// would move every existing bucket on disk), a sign-in adopts the spelling this
// server's existing data — or saved user — already uses.

// The React Query cache is re-derivable, so it doesn't count as "the user's
// data" when two spellings each hold some.
const CACHE_KEY_MARKER = ":wavio-rq";

/**
 * Copy the letter case of `spelling` onto `typed`. `spelling` is either a saved
 * username or a scope's username part, which getAuthScope sanitized one
 * character for one (non-alphanumerics become "_"), so positions line up.
 */
export function adoptCase(typed: string, spelling: string): string {
  let out = "";
  for (let i = 0; i < typed.length; i++) {
    const char = typed[i];
    const other = spelling[i];
    out +=
      other !== undefined && other.toLowerCase() === char.toLowerCase()
        ? other
        : char;
  }
  return out;
}

export function resolveSessionUsername({
  serverId,
  serverType,
  typed,
  savedUsernames,
  scopeWeights,
}: {
  serverId: string;
  serverType: ServerType;
  typed: string;
  savedUsernames: string[];
  // Bytes of user data per scope present in storage.
  scopeWeights: Map<string, number>;
}): string {
  if (!hasCaseInsensitiveUsernamesType(serverType)) return typed;
  const prefix = getAuthScope(serverId, "");
  const typedScope = getAuthScope(serverId, typed);
  let best: { scope: string; weight: number } | null = null;
  for (const [scope, weight] of scopeWeights) {
    if (!scope.startsWith(prefix)) continue;
    if (scope.toLowerCase() !== typedScope.toLowerCase()) continue;
    if (
      !best ||
      weight > best.weight ||
      (weight === best.weight && scope === typedScope)
    ) {
      best = { scope, weight };
    }
  }
  if (best) return adoptCase(typed, best.scope.slice(prefix.length));
  const saved = savedUsernames.find(
    (name) => name.toLowerCase() === typed.toLowerCase(),
  );
  return saved ?? typed;
}

function scopeWeightsInStorage(): Map<string, number> {
  const weights = new Map<string, number>();
  for (const key of storage.getAllKeys()) {
    const idx = key.indexOf(":");
    if (idx <= 0 || key.includes(CACHE_KEY_MARKER, idx)) continue;
    const scope = key.slice(0, idx);
    const bytes = storage.getString(key)?.length ?? 0;
    weights.set(scope, (weights.get(scope) ?? 0) + bytes);
  }
  return weights;
}

/** The username a sign-in to `server` should use for `typed`. */
export function sessionUsernameFor(
  server: { id: string; type: ServerType },
  typed: string,
  savedUsernames: string[],
): string {
  if (!hasCaseInsensitiveUsernamesType(server.type)) return typed;
  return resolveSessionUsername({
    serverId: server.id,
    serverType: server.type,
    typed,
    savedUsernames,
    scopeWeights: scopeWeightsInStorage(),
  });
}
