import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/users";
import * as S from "@/services/openSubsonic/users";

export type { UpdateUserParams } from "@/services/openSubsonic/users";

export const getUsers = dispatch(S.getUsers, J.getUsers);
export const getUser = dispatch(S.getUser, J.getUser);
export const updateUser = dispatch(S.updateUser, J.updateUser);
export const changePassword = dispatch(S.changePassword, J.changePassword);
