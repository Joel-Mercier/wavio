import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";

export const scrobble = async (id: string, { time, submission }: { time?: number, submission?: boolean }) => {
  const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<never>>(
    "/rest/scrobble",
    {
      id,
      time,
      submission
    }
  );
  return rsp.data;
};

export const setRating = async (id: string, rating: number) => {
  const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<never>>(
    "/rest/setRating",
    {
      id,
      rating
    }
  );
  return rsp.data;
};

export const star = async ({ id, albumId, artistId }: { id?: string, albumId?: string, artistId?: string }) => {
  const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<never>>(
    "/rest/star",
    {
      id,
      albumId,
      artistId
    }
  );
  return rsp.data;
};

export const unstar = async ({ id, albumId, artistId }: { id?: string, albumId?: string, artistId?: string }) => {
  const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<never>>(
    "/rest/unstar",
    {
      id,
      albumId,
      artistId
    }
  );
  return rsp.data;
};