import { getApiRequestsRemaining } from "@/services/taddyPodcasts/system";
import { useQuery } from "@tanstack/react-query";

export const useRemainingApiRequests = (enabled: boolean) => {
  return useQuery({
    queryKey: ["taddyPodcasts:remainingApiRequests"],
    queryFn: () => {
      return getApiRequestsRemaining();
    },
    enabled,
  });
};
