package expo.modules.smb

import expo.modules.kotlin.exception.CodedException

// The split that matters to JS is *which* of the three things a user got wrong:
// the password, the share name, or the address. Login maps each to different copy
// (see services/auth/authenticate.ts), and only the first is a credentials
// failure the sign-in flow should treat as recoverable in place.
//
// Codes are passed explicitly rather than left to CodedException's class-name
// inference so a rename can't silently change the contract JS switches on — same
// reasoning as modules/audio-waveform/.../Exceptions.kt.
sealed class SmbFailure(code: String, message: String) :
  CodedException(code, message, null)

/** Wrong username or password, or no access to the share. */
class SmbAuthException(message: String) : SmbFailure("ERR_SMB_AUTH", message)

/** The host answered, but has no share by that name. */
class SmbNoShareException(message: String) :
  SmbFailure("ERR_SMB_NO_SHARE", message)

/**
 * Nothing usable answered on that host and port. Also covers a server that only
 * speaks SMB1, which smbj refuses to negotiate — deliberately not its own code,
 * because from the user's side the fix is the same: point at something newer.
 */
class SmbUnreachableException(message: String) :
  SmbFailure("ERR_SMB_UNREACHABLE", message)

/** A path that isn't there, or isn't the kind of thing being asked for. */
class SmbPathException(message: String) : SmbFailure("ERR_SMB_PATH", message)
