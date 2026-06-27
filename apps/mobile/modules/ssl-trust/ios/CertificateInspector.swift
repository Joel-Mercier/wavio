import Foundation
import Security

/// Fetches the leaf certificate from a server without validating it, so the
/// user can inspect a self-signed cert before trusting it. Implemented with a
/// URLSession whose delegate captures the server trust during the TLS
/// challenge, then cancels the request (we only need the certificate).
final class CertificateInspector: NSObject, URLSessionDelegate {
  private var completion: (([String: Any]?, Error?) -> Void)?
  private var host: String = ""
  private var session: URLSession?

  func inspect(
    urlString: String, completion: @escaping ([String: Any]?, Error?) -> Void
  ) {
    guard let url = URL(string: urlString), let host = url.host else {
      completion(nil, NSError(
        domain: "SslTrust", code: -1,
        userInfo: [NSLocalizedDescriptionKey: "invalid URL: \(urlString)"]))
      return
    }
    self.completion = completion
    self.host = host
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 8
    // Avoid our own URLProtocol intercepting the inspection probe.
    config.protocolClasses = []
    let session = URLSession(
      configuration: config, delegate: self, delegateQueue: nil)
    self.session = session
    let task = session.dataTask(with: url)
    task.resume()
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (
      URLSession.AuthChallengeDisposition, URLCredential?
    ) -> Void
  ) {
    guard
      challenge.protectionSpace.authenticationMethod
        == NSURLAuthenticationMethodServerTrust,
      let trust = challenge.protectionSpace.serverTrust
    else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    let info = describe(trust: trust, host: host)
    completion?(info, nil)
    completion = nil
    // We have what we need; reject so no data is exchanged.
    completionHandler(.cancelAuthenticationChallenge, nil)
    session.invalidateAndCancel()
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    // If the challenge fired we've already completed; this only matters when
    // the connection failed before the TLS challenge.
    if let completion = completion {
      completion(
        nil,
        error
          ?? NSError(
            domain: "SslTrust", code: -2,
            userInfo: [NSLocalizedDescriptionKey: "no certificate received"]))
      self.completion = nil
    }
  }

  private func describe(trust: SecTrust, host: String) -> [String: Any] {
    let leaf: SecCertificate? = {
      if #available(iOS 15.0, *) {
        return (SecTrustCopyCertificateChain(trust) as? [SecCertificate])?.first
      } else {
        return SecTrustGetCertificateAtIndex(trust, 0)
      }
    }()

    var subject = host
    if let leaf = leaf,
      let summary = SecCertificateCopySubjectSummary(leaf) as String? {
      subject = summary
    }

    var systemTrusted = false
    var evalError: CFError?
    systemTrusted = SecTrustEvaluateWithError(trust, &evalError)

    let fingerprint = leaf.map { SslTrustStore.fingerprint(for: $0) } ?? ""

    return [
      "hostname": host,
      "subject": subject,
      "issuer": subject,  // SecCertificate gives no cheap issuer summary pre-parse
      "sha256Fingerprint": fingerprint,
      "validFrom": "",
      "validTo": "",
      "serialNumber": "",
      "selfSigned": !systemTrusted,
      "systemTrusted": systemTrusted,
    ]
  }
}
