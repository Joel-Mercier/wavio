import jellyfinApiInstance from "@/services/jellyfin/index";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import { useAuthBase } from "@/stores/auth";

function userId(): string {
  return useAuthBase.getState().jellyfinUserId ?? "";
}

function targetId(opts: {
  id?: string;
  albumId?: string;
  artistId?: string;
}): string | null {
  return opts.id ?? opts.albumId ?? opts.artistId ?? null;
}

export const star = async (opts: {
  id?: string;
  albumId?: string;
  artistId?: string;
}) => {
  const id = targetId(opts);
  if (!id) return fakeEnvelope({});
  await jellyfinApiInstance.post(`/Users/${userId()}/FavoriteItems/${id}`);
  return fakeEnvelope({});
};

export const unstar = async (opts: {
  id?: string;
  albumId?: string;
  artistId?: string;
}) => {
  const id = targetId(opts);
  if (!id) return fakeEnvelope({});
  await jellyfinApiInstance.delete(`/Users/${userId()}/FavoriteItems/${id}`);
  return fakeEnvelope({});
};

export const setRating = async (id: string, rating: number) => {
  // Jellyfin only supports thumbs-up/down via Likes; map >=3 to like.
  await jellyfinApiInstance.post(
    `/Users/${userId()}/Items/${id}/Rating`,
    null,
    {
      params: { Likes: rating >= 3 },
    },
  );
  return fakeEnvelope({});
};

export const scrobble = async (
  id: string,
  { time: _time, submission }: { time?: number; submission?: boolean },
) => {
  if (submission) {
    await jellyfinApiInstance.post("/Sessions/Playing/Stopped", {
      ItemId: id,
      PositionTicks: 0,
    });
  } else {
    await jellyfinApiInstance.post("/Sessions/Playing", {
      ItemId: id,
      CanSeek: true,
      IsPaused: false,
    });
  }
  return fakeEnvelope({});
};
