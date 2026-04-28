import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getScanStatus,
  startScan,
} from "@/services/openSubsonic/mediaLibraryScanning";

export const useGetScanStatus = () => {
  return useQuery({
    queryKey: ["getScanStatus"],
    queryFn: () => {
      return getScanStatus();
    },
    refetchInterval: 3000,
  });
};

export const useStartScan = () => {
  const query = useMutation({
    mutationFn: () => {
      return startScan();
    },
  });

  return query;
};
