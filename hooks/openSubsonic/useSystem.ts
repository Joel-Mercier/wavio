import {
  getLicense,
  getOpenSubsonicExtensions,
  ping,
} from "@/services/openSubsonic/system";
import { useQuery } from "@tanstack/react-query";

export const useGetLicense = () => {
  return useQuery({
    queryKey: ["getLicense"],
    queryFn: () => {
      return getLicense();
    },
  });
};

export const useGetOpenSubsonicExtensions = () => {
  return useQuery({
    queryKey: ["getOpenSubsonicExtensions"],
    queryFn: () => {
      return getOpenSubsonicExtensions();
    },
  });
};

export const usePing = () => {
  return useQuery({
    queryKey: ["ping"],
    queryFn: () => {
      return ping();
    },
  });
};
