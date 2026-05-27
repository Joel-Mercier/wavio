import type { useRouter } from "expo-router";
import { useAuthBase } from "@/stores/auth";
import { useServersBase } from "@/stores/servers";

type Router = ReturnType<typeof useRouter>;

export function switchToServer(
  router: Router,
  serverId: string,
  username?: string,
) {
  useAuthBase.getState().logout();
  useServersBase.getState().setCurrentServer(serverId);
  const params = new URLSearchParams({
    serverId,
    ...(username ? { username } : {}),
  });
  router.replace(`/(auth)/login?${params.toString()}` as never);
}
