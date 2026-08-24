import ExpoModulesCore

/**
 Everything needed to reach one share. Passed with every call rather than
 configured once, so JS never has to push state down here or worry about ordering:
 `bridgeUrl` is synchronous and can be called before anything else has touched this
 module. Mirrors SmbTarget.kt.
 */
final class SmbTargetRecord: Record {
  @Field var host: String = ""
  @Field var port: Int = 445
  @Field var share: String = ""
  /// NTLM domain / workgroup. Empty for most home NAS setups.
  @Field var domain: String = ""
  @Field var username: String = ""
  @Field var password: String = ""

  /// The record is a reference type that Expo hands us on the calling thread; the
  /// store and the bridge both need to carry it across isolation boundaries, so
  /// everything past this module works on the value type instead.
  func endpoint() -> SmbEndpoint {
    SmbEndpoint(
      host: host,
      port: port,
      share: share,
      domain: domain,
      username: username,
      password: password
    )
  }
}

struct SmbEndpoint: Sendable, Hashable {
  let host: String
  let port: Int
  let share: String
  let domain: String
  let username: String
  let password: String

  /**
   Identity of the connection this target needs. The password is part of it so that
   changing it forces a reconnect rather than reusing a session authenticated with
   the old one.
   */
  var key: String {
    [host, String(port), share, domain, username, password].joined(separator: " ")
  }
}
