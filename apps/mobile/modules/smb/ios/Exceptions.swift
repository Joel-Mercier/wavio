import ExpoModulesCore

// The split that matters to JS is *which* of the three things a user got wrong:
// the password, the share name, or the address. Login maps each to different copy
// (see services/auth/authenticate.ts), and only the first is a credentials failure
// the sign-in flow should treat as recoverable in place.
//
// Codes are spelled out rather than left to inference so a rename can't silently
// change the contract JS switches on — same reasoning as
// modules/smb/android/.../Exceptions.kt, whose codes these must match exactly.

/// Marks the exceptions this module raises deliberately, so `SmbModule` can pass
/// them through untouched and wrap everything else as unreachable.
protocol SmbFailure: Error {}

/// Wrong username or password, or no access to the share.
final class SmbAuthException: GenericException<String>, SmbFailure {
  override var code: String { "ERR_SMB_AUTH" }
  override var reason: String { param }
}

/// The host answered, but has no share by that name.
final class SmbNoShareException: GenericException<String>, SmbFailure {
  override var code: String { "ERR_SMB_NO_SHARE" }
  override var reason: String { param }
}

/// Nothing usable answered on that host and port. Also covers a server that only
/// speaks SMB1, which is never negotiated — deliberately not its own code, because
/// from the user's side the fix is the same: point at something newer.
final class SmbUnreachableException: GenericException<String>, SmbFailure {
  override var code: String { "ERR_SMB_UNREACHABLE" }
  override var reason: String { param }
}

/// A path that isn't there, or isn't the kind of thing being asked for.
final class SmbPathException: GenericException<String>, SmbFailure {
  override var code: String { "ERR_SMB_PATH" }
  override var reason: String { param }
}

/// The server refused to negotiate a dialect we speak.
///
/// iOS-only: the vendored SMBClient implements SMB 2.0.2 and 2.1 but not the 3.x
/// signing and pre-auth integrity (see ios/vendor/VENDOR.md), so a share configured
/// with `server min protocol = SMB3` is unusable here while it works on Android.
/// That is a different fix from "check the address", so it gets its own code.
final class SmbDialectException: GenericException<String>, SmbFailure {
  override var code: String { "ERR_SMB_DIALECT" }
  override var reason: String { param }
}
