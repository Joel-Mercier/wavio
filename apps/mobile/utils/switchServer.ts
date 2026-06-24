import type { useRouter } from "expo-router";
import { useAuthBase } from "@/stores/auth";
import { useServersBase } from "@/stores/servers";

type Router = ReturnType<typeof useRouter>;

// Resolve which saved user to silently re-authenticate as when switching to a
// server. A username (avatar tap) wins; otherwise we only auto-resolve when
// exactly one user on the server has saved credentials. Local servers never
// qualify (no remote credentials to replay).
function resolveSavedCredential(serverId: string, username?: string) {
  const server = useServersBase.getState().getServerById(serverId);
  if (!server || server.type === "local") return null;
  const users = useServersBase
    .getState()
    .users.filter((u) => u.serverId === serverId && !!u.password);
  if (username) {
    return users.find((u) => u.username === username) ?? null;
  }
  return users.length === 1 ? users[0] : null;
}

export function switchToServer(
  router: Router,
  serverId: string,
  username?: string,
) {
  const saved = resolveSavedCredential(serverId, username);

  useAuthBase.getState().logout();
  useServersBase.getState().setCurrentServer(serverId);

  // With saved credentials we re-authenticate headlessly on the switching
  // screen (a blank spinner) instead of routing through the login form, so the
  // user lands straight on Home. The teardown (logout above) and the scoped
  // rehydrate in app/(app)/_layout.tsx are identical either way, so no React
  // Query data bleeds between servers.
  if (saved) {
    const params = new URLSearchParams({
      serverId,
      username: saved.username,
    });
    router.replace(`/(auth)/switching?${params.toString()}` as never);
    return;
  }

  const params = new URLSearchParams({
    serverId,
    ...(username ? { username } : {}),
  });
  router.replace(`/(auth)/login?${params.toString()}` as never);
}
