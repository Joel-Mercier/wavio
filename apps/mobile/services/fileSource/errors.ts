// Why a file-source operation failed, in the terms the user can act on.
//
// The native SMB module already raises coded exceptions (ERR_SMB_AUTH and
// friends, see modules/smb/.../Exceptions.kt) and `services/auth/authenticate.ts`
// maps each to its own login copy. Everything *else* threw either a bare
// AxiosError or nothing at all: `exists()` used to answer `false` for a 401, a
// TLS failure, a timeout and a genuinely missing folder alike. That is what let a
// dropped Wi-Fi link look like an empty share to the scanner, which then pruned
// the index down to what it had managed to list.
//
// So the codes below are not cosmetic. Two consumers depend on the distinction:
//
//  - `scanLibrary` must tell "this folder is gone, prune its tracks" from "I
//    couldn't reach the share, touch nothing".
//  - the scan gate and the login form need to say which of the user's inputs is
//    wrong, rather than rendering an AxiosError message.
//
// Codes are strings rather than an enum so a native `CodedException.code` and a
// JS-side failure can travel in the same field and be switched on identically.

export type FileSourceErrorCode =
  /** Credentials rejected, or no access to this path. */
  | "ERR_FS_AUTH"
  /** The path isn't there. The only code that means "safe to prune". */
  | "ERR_FS_NOT_FOUND"
  /** Nothing usable answered: DNS, refused connection, timeout, TLS. */
  | "ERR_FS_UNREACHABLE"
  /** Something answered, but it doesn't speak the protocol we need. */
  | "ERR_FS_NOT_SUPPORTED"
  /** Reached and understood, but the server refused or failed the operation. */
  | "ERR_FS_SERVER";

export class FileSourceError extends Error {
  readonly code: FileSourceErrorCode;
  /** The underlying native/HTTP code, kept for Sentry and for login copy. */
  readonly cause?: unknown;

  constructor(code: FileSourceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "FileSourceError";
    this.code = code;
    this.cause = cause;
  }
}

export const isFileSourceError = (error: unknown): error is FileSourceError =>
  error instanceof FileSourceError;

/**
 * Whether a failure means the path is definitively absent.
 *
 * The scanner's prune step keys on exactly this: only a confirmed 404 (or its
 * SMB equivalent) may remove tracks. Every other failure mode has to leave the
 * index alone, because the file may well still be there behind a link we can't
 * currently use.
 */
export const isDefinitelyAbsent = (error: unknown): boolean =>
  isFileSourceError(error) && error.code === "ERR_FS_NOT_FOUND";

/**
 * The code to show for a failure, whatever threw it.
 *
 * Returns `undefined` for something we have no classification for, which the UI
 * renders as a generic message rather than inventing a wrong specific one.
 */
export function fileSourceErrorCode(
  error: unknown,
): FileSourceErrorCode | undefined {
  if (isFileSourceError(error)) return error.code;
  // A native SMB exception that reached the UI without passing through a
  // FileSource method (login and probe both call the module directly).
  const native = codeOf(error);
  return native ? SMB_CODES[native] : undefined;
}

/** Codes the native SMB module raises, mapped onto ours. */
const SMB_CODES: Record<string, FileSourceErrorCode> = {
  ERR_SMB_AUTH: "ERR_FS_AUTH",
  ERR_SMB_NO_SHARE: "ERR_FS_NOT_FOUND",
  ERR_SMB_PATH: "ERR_FS_NOT_FOUND",
  ERR_SMB_UNREACHABLE: "ERR_FS_UNREACHABLE",
  // iOS only: the vendored Swift client speaks SMB 2.x, so a share requiring
  // SMB 3 is unusable there while it works on Android.
  ERR_SMB_DIALECT: "ERR_FS_NOT_SUPPORTED",
};

const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : undefined;
};

/** Wrap whatever the SMB native module threw as a `FileSourceError`. */
export function fromSmbError(error: unknown, context: string): FileSourceError {
  if (isFileSourceError(error)) return error;
  const native = codeOf(error);
  const mapped = native ? SMB_CODES[native] : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return new FileSourceError(
    mapped ?? "ERR_FS_UNREACHABLE",
    `${context}: ${message}`,
    error,
  );
}

/**
 * Classify an HTTP failure (WebDAV).
 *
 * `status` is undefined when the request never got a response at all, which is
 * the unreachable case rather than a server error.
 */
export function fromHttpStatus(
  status: number | undefined,
  context: string,
  cause?: unknown,
): FileSourceError {
  if (status === undefined) {
    return new FileSourceError(
      "ERR_FS_UNREACHABLE",
      `${context}: no response`,
      cause,
    );
  }
  return new FileSourceError(
    httpCode(status),
    `${context}: HTTP ${status}`,
    cause,
  );
}

function httpCode(status: number): FileSourceErrorCode {
  if (status === 401 || status === 403) return "ERR_FS_AUTH";
  if (status === 404 || status === 410) return "ERR_FS_NOT_FOUND";
  // 405 is what a plain web server (or a proxy stripping WebDAV verbs) returns
  // for PROPFIND; 501 is a server that knows the method and won't do it. Both
  // mean "this URL isn't a WebDAV share", not "the folder is missing" — telling
  // them apart is the difference between a useful hint and a wrong one.
  if (status === 405 || status === 501) return "ERR_FS_NOT_SUPPORTED";
  // A redirect that survived axios' follow is almost always a login page
  // standing in front of the share.
  if (status >= 300 && status < 400) return "ERR_FS_NOT_SUPPORTED";
  return "ERR_FS_SERVER";
}
