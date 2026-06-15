import { setTag, setUser } from "@sentry/react-native";
import { getAuthScope } from "@/config/storage";
import { useAuthBase } from "@/stores/auth";

// Attribute Sentry events to the active (server, user) scope and backend, so an
// Issue can be tied to "which connection hit it" without shipping the real
// server URL or username. The scope key is hashed to a short opaque id — enough
// to group a user's events and tell two connections apart, but not reversible to
// the underlying host/credentials.
function hashScope(scope: string): string {
  let hash = 5381;
  for (let i = 0; i < scope.length; i++) {
    hash = (hash * 33) ^ scope.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function applyScope(state: ReturnType<typeof useAuthBase.getState>): void {
  setTag("serverType", state.serverType);
  if (!state.isAuthenticated) {
    setUser(null);
    return;
  }
  setUser({ id: hashScope(getAuthScope(state.url, state.username)) });
}

/**
 * Keep the Sentry scope in sync with the active server/user. Call once at app
 * start; returns an unsubscribe.
 */
export function initSentryScope(): () => void {
  applyScope(useAuthBase.getState());
  return useAuthBase.subscribe(applyScope);
}
