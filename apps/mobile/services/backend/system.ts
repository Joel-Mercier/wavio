import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/system";
import * as L from "@/services/local/system";
import * as S from "@/services/openSubsonic/system";

export const ping = dispatch(S.ping, J.ping, L.ping);
export const getLicense = dispatch(S.getLicense, J.getLicense, L.getLicense);
export const getOpenSubsonicExtensions = dispatch(
  S.getOpenSubsonicExtensions,
  J.getOpenSubsonicExtensions,
  L.getOpenSubsonicExtensions,
);
