import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/mediaLibraryScanning";
import * as L from "@/services/local/mediaLibraryScanning";
import * as S from "@/services/openSubsonic/mediaLibraryScanning";

export const getScanStatus = dispatch(
  S.getScanStatus,
  J.getScanStatus,
  L.getScanStatus,
);
export const startScan = dispatch(S.startScan, J.startScan, L.startScan);
