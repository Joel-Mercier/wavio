import ExpoModulesCore
import Foundation

public class SslTrustModule: Module {
  // Retained while an inspection is in flight (the inspector is the URLSession
  // delegate, so it must outlive the request).
  private var inspectors: [CertificateInspector] = []

  public func definition() -> ModuleDefinition {
    Name("SslTrust")

    AsyncFunction("initTrustStore") { () -> [String: Any?] in
      SslTrustSwizzle.install()
      return ["installed": true, "error": nil]
    }

    AsyncFunction("getInstallStatus") { () -> [String: Any?] in
      ["installed": true, "error": nil]
    }

    AsyncFunction("getCertificateInfo") { (url: String, promise: Promise) in
      let inspector = CertificateInspector()
      self.inspectors.append(inspector)
      inspector.inspect(urlString: url) { info, error in
        self.inspectors.removeAll { $0 === inspector }
        if let info = info {
          promise.resolve(info)
        } else {
          promise.reject(
            "ERR_SSL_INSPECT",
            error?.localizedDescription ?? "failed to inspect certificate")
        }
      }
    }

    AsyncFunction("trustCertificate") {
      (hostname: String, sha256Fingerprint: String, validTo: String?) in
      SslTrustStore.shared.trust(
        host: hostname, fingerprint: sha256Fingerprint, validTo: validTo)
    }

    AsyncFunction("removeTrustedCertificate") { (hostname: String) in
      SslTrustStore.shared.remove(host: hostname)
    }

    AsyncFunction("clearAllTrustedCertificates") {
      SslTrustStore.shared.clearAll()
    }

    AsyncFunction("getTrustedCertificates") { () -> [[String: Any]] in
      SslTrustStore.shared.all()
    }

    AsyncFunction("isCertificateTrusted") { (hostname: String) -> Bool in
      SslTrustStore.shared.isTrusted(host: hostname)
    }

    AsyncFunction("syncProxyUpstreams") { (baseUrls: [String]) -> [String: Any]? in
      SslTrustProxy.shared.sync(baseUrls: baseUrls)
    }

    AsyncFunction("getProxyInfo") { () -> [String: Any]? in
      SslTrustProxy.shared.info()
    }
  }
}
