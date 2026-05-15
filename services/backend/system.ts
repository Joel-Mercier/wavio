import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/system";
import * as S from "@/services/openSubsonic/system";

export const ping = dispatch(S.ping, J.ping);
export const getLicense = dispatch(S.getLicense, J.getLicense);
export const getOpenSubsonicExtensions = dispatch(
  S.getOpenSubsonicExtensions,
  J.getOpenSubsonicExtensions,
);
