import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/searching";
import * as L from "@/services/local/searching";
import * as S from "@/services/openSubsonic/searching";

export const search = dispatch(S.search, J.search, L.search);
export const search2 = dispatch(S.search2, J.search2, L.search2);
export const search3 = dispatch(S.search3, J.search3, L.search3);
