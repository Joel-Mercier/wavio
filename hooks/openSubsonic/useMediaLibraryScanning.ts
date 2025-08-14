import {
  getScanStatus,
  startScan,
} from "@/services/openSubsonic/mediaLibraryScanning";
import { useMutation, useQuery } from "@tanstack/react-query";

export const useGetScanStatus = () => {
  return useQuery({
    queryKey: ["getScanStatus"],
    queryFn: () => {
      return getScanStatus();
    },
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
