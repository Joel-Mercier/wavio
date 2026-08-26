import { requireOptionalNativeModule } from "expo";

/**
 * Access to a network file share: SMB2/3 on Android, SMB2 on iOS (the vendored
 * Swift client doesn't implement 3.x — see modules/smb/ios/vendor/VENDOR.md).
 *
 * `Native` is still null where the module can't load at all — web, and Expo Go —
 * so `isSmbAvailable()` remains the gate the server-type pickers use.
 *
 * The module is stateless from here: every call carries its target, so nothing
 * has to be configured before `bridgeUrl` — which matters because
 * `FileSource.playableUrl` is synchronous and may be the first thing a cold start
 * asks for. See services/fileSource/smb.ts.
 */

export type SmbTarget = {
  host: string;
  port: number;
  share: string;
  /** NTLM domain / workgroup. Empty for most home NAS setups. */
  domain: string;
  username: string;
  password: string;
};

export type SmbEntry = {
  name: string;
  isDirectory: boolean;
  size: number;
  /** Epoch ms. */
  mtime: number;
};

type SmbNativeModule = {
  /**
   * Loopback URL any HTTP consumer on this device can open for `path`. Starts the
   * bridge if it isn't running; synchronous by design.
   */
  bridgeUrl(target: SmbTarget, path: string, timeoutMs: number): string;
  list(target: SmbTarget, path: string, timeoutMs: number): Promise<SmbEntry[]>;
  exists(target: SmbTarget, path: string, timeoutMs: number): Promise<boolean>;
  probe(target: SmbTarget, timeoutMs: number): Promise<boolean>;
  disconnect(): Promise<boolean>;
};

const Native = requireOptionalNativeModule<SmbNativeModule>("Smb");

export const isSmbAvailable = (): boolean => Native != null;

function required(): SmbNativeModule {
  if (!Native) {
    throw new Error(
      "SMB native module is unavailable. It needs `expo prebuild` plus a native " +
        "rebuild, and can't be loaded in Expo Go or on web.",
    );
  }
  return Native;
}

export function smbBridgeUrl(
  target: SmbTarget,
  path: string,
  timeoutMs: number,
): string {
  return required().bridgeUrl(target, path, timeoutMs);
}

export function smbList(
  target: SmbTarget,
  path: string,
  timeoutMs: number,
): Promise<SmbEntry[]> {
  return required().list(target, path, timeoutMs);
}

export function smbExists(
  target: SmbTarget,
  path: string,
  timeoutMs: number,
): Promise<boolean> {
  return required().exists(target, path, timeoutMs);
}

export function smbProbe(
  target: SmbTarget,
  timeoutMs: number,
): Promise<boolean> {
  return required().probe(target, timeoutMs);
}

/**
 * Drops the cached session and stops the bridge. Best effort — a stale session
 * also heals itself on the next call, since the connection cache is keyed on the
 * target.
 */
export async function smbDisconnect(): Promise<void> {
  if (!Native) return;
  try {
    await Native.disconnect();
  } catch {
    // Nothing to release, or already gone.
  }
}
