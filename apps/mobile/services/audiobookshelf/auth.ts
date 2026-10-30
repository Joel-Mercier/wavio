import axios from "axios";
import absApiInstance, {
  absRequest,
  normalizeServerUrl,
} from "@/services/audiobookshelf/index";
import type {
  AbsLibrary,
  AbsLoginResponse,
  AbsServerStatus,
  AbsUser,
} from "@/services/audiobookshelf/types";
import { useAudiobookshelfBase } from "@/stores/audiobookshelf";

export class AudiobookshelfUnreachableError extends Error {
  constructor() {
    super("Audiobookshelf server unreachable");
    this.name = "AudiobookshelfUnreachableError";
  }
}

export class AudiobookshelfInvalidCredentialsError extends Error {
  constructor() {
    super("Invalid Audiobookshelf credentials");
    this.name = "AudiobookshelfInvalidCredentialsError";
  }
}

// The JWT sign-in arrived in v2.26; older servers only hand out the legacy
// never-expiring token, which this client doesn't speak.
export class AudiobookshelfUnsupportedVersionError extends Error {
  constructor(readonly version: string) {
    super(`Audiobookshelf ${version} is too old`);
    this.name = "AudiobookshelfUnsupportedVersionError";
  }
}

export const MIN_SERVER_VERSION = [2, 26, 0] as const;

export function isSupportedVersion(version: string): boolean {
  const parts = version
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < MIN_SERVER_VERSION.length; i += 1) {
    const actual = parts[i] ?? 0;
    if (actual !== MIN_SERVER_VERSION[i]) {
      return actual > MIN_SERVER_VERSION[i];
    }
  }
  return true;
}

export async function getServerStatus(
  serverUrl: string,
): Promise<AbsServerStatus> {
  try {
    const { data } = await absApiInstance.get<AbsServerStatus>(
      `${serverUrl}/status`,
    );
    if (data?.app !== "audiobookshelf") {
      throw new AudiobookshelfUnreachableError();
    }
    return data;
  } catch (error) {
    if (error instanceof AudiobookshelfUnreachableError) throw error;
    throw new AudiobookshelfUnreachableError();
  }
}

export interface AbsSignInResult {
  serverUrl: string;
  user: AbsUser;
  serverVersion: string;
  defaultLibraryId: string | null;
}

export async function signIn(input: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<AbsSignInResult> {
  const serverUrl = normalizeServerUrl(input.serverUrl);
  const status = await getServerStatus(serverUrl);
  if (!isSupportedVersion(status.serverVersion)) {
    throw new AudiobookshelfUnsupportedVersionError(status.serverVersion);
  }
  try {
    const { data } = await absApiInstance.post<AbsLoginResponse>(
      `${serverUrl}/login`,
      { username: input.username.trim(), password: input.password },
      { headers: { "x-return-tokens": "true" } },
    );
    if (!data.user.accessToken || !data.user.refreshToken) {
      throw new AudiobookshelfUnsupportedVersionError(status.serverVersion);
    }
    return {
      serverUrl,
      user: data.user,
      serverVersion: status.serverVersion,
      defaultLibraryId: data.userDefaultLibraryId ?? null,
    };
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 400)
    ) {
      throw new AudiobookshelfInvalidCredentialsError();
    }
    throw error;
  }
}

// Best effort: the refresh token is invalidated server-side so a removed
// account can't be revived from a copy of the store.
export async function signOut(): Promise<void> {
  const { serverUrl, refreshToken } = useAudiobookshelfBase.getState();
  if (!serverUrl || !refreshToken) return;
  try {
    await absApiInstance.post(`${serverUrl}/logout`, null, {
      headers: { "x-refresh-token": refreshToken },
      timeout: 5000,
    });
  } catch {}
}

export async function getMe(): Promise<AbsUser> {
  return absRequest<AbsUser>("/api/me");
}

export async function getLibraries(config?: {
  serverUrl: string;
  accessToken: string;
}): Promise<AbsLibrary[]> {
  const data = await absRequest<{ libraries: AbsLibrary[] }>("/api/libraries", {
    config,
  });
  return [...data.libraries].sort((a, b) => a.displayOrder - b.displayOrder);
}

export function bookLibraries(libraries: AbsLibrary[]) {
  return libraries
    .filter((library) => library.mediaType === "book")
    .map(({ id, name }) => ({ id, name }));
}
