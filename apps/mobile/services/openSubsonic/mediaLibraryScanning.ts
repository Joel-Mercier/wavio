import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
  subsonicEnvelope,
  subsonicRequest,
} from "@/services/openSubsonic/index";
import type { ScanStatus } from "@/services/openSubsonic/types";

export const getScanStatus = async () =>
  subsonicRequest<{ scanStatus: ScanStatus }>("/rest/getScanStatus");

export const startScan = async () =>
  subsonicEnvelope(
    await openSubsonicApiInstance.post<
      OpenSubsonicResponse<{ scanStatus: ScanStatus }>
    >("/rest/startScan", {}),
  );
