import {
  createInternetRadioStation,
  deleteInternetRadioStation,
  getInternetRadioStations,
  updateInternetRadioStation,
} from "@/services/openSubsonic/internetRadioStations";
import { useMutation, useQuery } from "@tanstack/react-query";

export const useCreateInternetRadioStation = () => {
  return useMutation({
    mutationFn: (params: {
      streamUrl: string;
      name: string;
      homePageUrl?: string;
    }) => {
      const { streamUrl, name, homePageUrl } = params;
      return createInternetRadioStation(streamUrl, name, homePageUrl);
    },
  });
};

export const useDeleteInternetRadioStation = () => {
  return useMutation({
    mutationFn: (params: { id: string }) => {
      const { id } = params;
      return deleteInternetRadioStation(id);
    },
  });
};

export const useGetInternetRadioStations = () => {
  return useQuery({
    queryKey: ["internet_radio_stations"],
    queryFn: () => {
      return getInternetRadioStations();
    },
  });
};

export const useUpdateInternetRadioStation = () => {
  return useMutation({
    mutationFn: (params: {
      id: string;
      streamUrl: string;
      name: string;
      homePageUrl?: string;
    }) => {
      const { id, streamUrl, name, homePageUrl } = params;
      return updateInternetRadioStation(id, { streamUrl, name, homePageUrl });
    },
  });
};
