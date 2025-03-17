import { scrobble, setRating, star, unstar } from "@/services/openSubsonic/mediaAnnotation";
import { useMutation } from "@tanstack/react-query";

export const useScrobble = () => {
  const query = useMutation({
    mutationFn: (params: { id: string, time?: number, submission?: boolean }) => {
      const { id, time, submission } = params;
      return scrobble(id, { time, submission });
    },
  });

  return query;
}

export const useSetRating = () => {
  const query = useMutation({
    mutationFn: (params: { id: string, rating: number }) => {
      const { id, rating } = params;
      return setRating(id, rating);
    },
  });

  return query;
}

export const useStar = () => {
  const query = useMutation({
    mutationFn: (params: { id?: string, albumId?: string, artistId?: string }) => {
      return star(params);
    },
  });

  return query;
};

export const useUnstar = () => {
  const query = useMutation({
    mutationFn: (params: { id?: string, albumId?: string, artistId?: string }) => {
      return unstar(params);
    },
  });

  return query;
};
