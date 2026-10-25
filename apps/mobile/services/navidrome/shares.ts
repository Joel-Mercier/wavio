import navidromeApiInstance from "@/services/navidrome";
import { asList } from "@/services/navidrome/listBody";
import type {
  NavidromeShare,
  NavidromeTranscoding,
} from "@/services/navidrome/types";
import { getShares as getSubsonicShares } from "@/services/openSubsonic/sharing";

export type ShareTranscodeOptions = { format: string; maxBitRate: number };

export const getTranscodings = async (): Promise<NavidromeTranscoding[]> => {
  const rsp = await navidromeApiInstance.get<NavidromeTranscoding[]>(
    "/transcoding",
    { params: { _sort: "name", _order: "ASC" } },
  );
  return asList<NavidromeTranscoding>(rsp.data);
};

export const getShares = async (): Promise<NavidromeShare[]> => {
  const rsp = await navidromeApiInstance.get<NavidromeShare[]>("/share");
  return asList<NavidromeShare>(rsp.data);
};

// Subsonic createShare ignores format/maxBitRate, so a transcoded share has to
// go through the native API. That answers with the id alone; the Subsonic
// listing supplies the public URL, which honours the server's ShareURL setting.
export const createShare = async (
  id: string,
  { format, maxBitRate }: ShareTranscodeOptions,
  downloadable?: boolean,
) => {
  const rsp = await navidromeApiInstance.post<{ id: string }>("/share", {
    resourceIds: id,
    format,
    maxBitRate,
    downloadable,
  });
  const shareId = rsp.data?.id;
  if (!shareId) {
    throw new Error("Navidrome did not return the created share id");
  }
  const listing = await getSubsonicShares();
  const created = listing.shares?.share?.find((share) => share.id === shareId);
  if (!created) {
    throw new Error(`Created share ${shareId} is missing from getShares`);
  }
  return { ...listing, shares: { share: [created] } };
};
