export interface NavidromeUser {
  id: string;
  userName: string;
  name: string;
  email: string;
  isAdmin: boolean;
  lastLoginAt?: string;
  lastAccessAt?: string;
  createdAt?: string;
  updatedAt?: string;
  libraries?: NavidromeLibrary[];
}

export interface NavidromeLibrary {
  id: number;
  name: string;
  path?: string;
}

export interface NavidromeAuthPayload {
  id: string;
  name: string;
  username: string;
  isAdmin: boolean;
  token: string;
  subsonicSalt?: string;
  subsonicToken?: string;
  avatar?: string;
}

export interface NavidromeUpdateUserBody {
  userName: string;
  name: string;
  email: string;
  isAdmin: boolean;
  password?: string;
  currentPassword?: string;
}

export interface NavidromeCreateUserBody {
  userName: string;
  name?: string;
  email?: string;
  isAdmin?: boolean;
  password: string;
}
