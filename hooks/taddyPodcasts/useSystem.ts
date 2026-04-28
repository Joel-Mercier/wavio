import { useQuery } from "@tanstack/react-query";
import { getApiRequestsRemaining } from "@/services/taddyPodcasts/system";

export const useRemainingApiRequests = (enabled: boolean) => {
  return useQuery({
    queryKey: ["taddyPodcasts:remainingApiRequests"],
    queryFn: () => {
      return getApiRequestsRemaining();
    },
    enabled,
  });
};
