import {
  createBookmark,
  deleteBookmark,
  getBookmarks,
  getPlayQueue,
  savePlayQueue,
} from "@/services/openSubsonic/bookmarks";
import { useMutation, useQuery } from "@tanstack/react-query";

export const useCreateBookmark = () => {
  const query = useMutation({
    mutationFn: (params: {
      id: string;
      position: number;
      comment?: string;
    }) => {
      const { id, position, comment } = params;
      return createBookmark(id, position, { comment });
    },
  });

  return query;
};

export const useDeleteBookmark = () => {
  const query = useMutation({
    mutationFn: (params: { id: string }) => {
      const { id } = params;
      return deleteBookmark(id);
    },
  });

  return query;
};

export const useBookmarks = () => {
  const query = useQuery({
    queryKey: ["bookmarks"],
    queryFn: () => {
      return getBookmarks();
    },
  });

  return query;
};

export const usePlayQueue = () => {
  const query = useQuery({
    queryKey: ["playQueue"],
    queryFn: () => {
      return getPlayQueue();
    },
  });

  return query;
};

export const useSavePlayQueue = () => {
  const query = useMutation({
    mutationFn: (params: {
      id?: string;
      current?: string;
      position?: number;
    }) => {
      return savePlayQueue(params);
    },
  });

  return query;
};
