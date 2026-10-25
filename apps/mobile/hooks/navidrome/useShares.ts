import { useQuery } from "@tanstack/react-query";
import { useGetUser } from "@/hooks/backend/useUsers";
import { useCapabilities } from "@/hooks/useCapabilities";
import { getShares, getTranscodings } from "@/services/navidrome/shares";
import { useAuthBase } from "@/stores/auth";

export const useCanTranscodeShares = () => {
  const { sharing, shareTranscoding } = useCapabilities();
  const hasNavidromeNative = useAuthBase((store) => store.hasNavidromeNative);
  return sharing && shareTranscoding && hasNavidromeNative;
};

// Navidrome reports its EnableDownloads setting as every user's downloadRole;
// with downloads off server-wide a downloadable share has nothing to offer.
export const useShareDownloadsEnabled = (enabled: boolean) => {
  const username = useAuthBase((store) => store.username);
  const { data } = useGetUser(username, enabled);
  return !!data?.user?.downloadRole;
};

export const useNavidromeTranscodings = (enabled: boolean) => {
  return useQuery({
    queryKey: ["nd", "transcodings"],
    queryFn: getTranscodings,
    enabled,
  });
};

export const useNavidromeShares = (enabled: boolean) => {
  return useQuery({
    queryKey: ["shares", "nd"],
    queryFn: getShares,
    enabled,
  });
};
