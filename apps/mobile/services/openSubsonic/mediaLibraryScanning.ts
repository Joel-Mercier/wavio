import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
  subsonicEnvelope,
  subsonicRequest,
} from "@/services/openSubsonic/index";
import type { ScanStatus } from "@/services/openSubsonic/types";

export const getScanStatus = async () =>
  subsonicRequest<{ scanStatus: ScanStatus }>("/rest/getScanStatus");

// Navidrome restricts startScan to admins and returns Subsonic code 50 for
// everyone else. The caller (settings) turns that into an "admin required"
// toast, and the reportError classifier already keeps code 50 out of Sentry.
export const startScan = async () =>
  subsonicEnvelope(
    await openSubsonicApiInstance.post<
      OpenSubsonicResponse<{ scanStatus: ScanStatus }>
    >("/rest/startScan", {}),
  );
