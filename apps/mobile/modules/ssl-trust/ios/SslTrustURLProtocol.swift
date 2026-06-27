import Foundation
import Security

/// Intercepts URLSession traffic (axios/fetch, expo-image, expo-file-system
/// downloads) to trusted self-signed hosts and re-issues the request through an
/// internal session whose TLS challenge accepts the trusted certificate.
///
/// Registered into URLSession configurations by `SslTrustSwizzle`. AVPlayer
/// (expo-audio) ignores URLProtocols — that path goes through `SslTrustProxy`.
final class SslTrustURLProtocol: URLProtocol, URLSessionDataDelegate {
  private static let handledKey = "SslTrustURLProtocolHandled"
  private var forwardSession: URLSession?
  private var forwardTask: URLSessionDataTask?

  override class func canInit(with request: URLRequest) -> Bool {
    guard
      URLProtocol.property(forKey: handledKey, in: request) == nil,
      let host = request.url?.host,
      request.url?.scheme?.lowercased() == "https"
    else { return false }
    return SslTrustStore.shared.isTrusted(host: host)
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    guard
      let mutable = (request as NSURLRequest).mutableCopy() as? NSMutableURLRequest
    else { return }
    URLProtocol.setProperty(true, forKey: Self.handledKey, in: mutable)

    let config = URLSessionConfiguration.default
    config.protocolClasses = []  // prevent recursion
    let session = URLSession(
      configuration: config, delegate: self, delegateQueue: nil)
    self.forwardSession = session
    let task = session.dataTask(with: mutable as URLRequest)
    self.forwardTask = task
    task.resume()
  }

  override func stopLoading() {
    forwardTask?.cancel()
    forwardSession?.invalidateAndCancel()
  }

  // MARK: forwarding

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
    let host = challenge.protectionSpace.host
    if SslTrustStore.shared.isTrusted(host: host),
      let leaf = leafCertificate(trust),
      SslTrustStore.shared.isFingerprintTrusted(
        SslTrustStore.fingerprint(for: leaf))
    {
      completionHandler(.useCredential, URLCredential(trust: trust))
    } else {
      completionHandler(.performDefaultHandling, nil)
    }
  }

  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    client?.urlProtocol(
      self, didReceive: response, cacheStoragePolicy: .notAllowed)
    completionHandler(.allow)
  }

  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data
  ) {
    client?.urlProtocol(self, didLoad: data)
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    if let error = error {
      client?.urlProtocol(self, didFailWithError: error)
    } else {
      client?.urlProtocolDidFinishLoading(self)
    }
    forwardSession?.finishTasksAndInvalidate()
  }

  private func leafCertificate(_ trust: SecTrust) -> SecCertificate? {
    if #available(iOS 15.0, *) {
      return (SecTrustCopyCertificateChain(trust) as? [SecCertificate])?.first
    } else {
      return SecTrustGetCertificateAtIndex(trust, 0)
    }
  }
}
