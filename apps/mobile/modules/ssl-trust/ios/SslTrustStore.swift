import CryptoKit
import Foundation
import Security

/// Per-host trust store (host -> SHA-256 fingerprint), persisted in
/// UserDefaults. Keyed by host, not per server/user — a certificate belongs to
/// a host. Mirrors the Android `SslTrustStore` contract.
final class SslTrustStore {
  static let shared = SslTrustStore()

  private let defaultsKey = "wavio_ssl_trust_entries"
  private let queue = DispatchQueue(label: "app.wavio.ssltrust.store")
  private var entries: [String: TrustedCertEntry] = [:]

  struct TrustedCertEntry: Codable {
    let hostname: String
    let sha256Fingerprint: String
    let acceptedAt: Double
    let validTo: String?
  }

  private init() {
    load()
  }

  // MARK: queries / mutations

  func isTrusted(host: String) -> Bool {
    queue.sync { entries[host.lowercased()] != nil }
  }

  func isFingerprintTrusted(_ fingerprint: String) -> Bool {
    queue.sync {
      entries.values.contains {
        $0.sha256Fingerprint.caseInsensitiveCompare(fingerprint) == .orderedSame
      }
    }
  }

  func all() -> [[String: Any]] {
    queue.sync {
      entries.values.map {
        [
          "hostname": $0.hostname,
          "sha256Fingerprint": $0.sha256Fingerprint,
          "acceptedAt": $0.acceptedAt,
          "validTo": $0.validTo as Any,
        ]
      }
    }
  }

  func trust(host: String, fingerprint: String, validTo: String?) {
    queue.sync {
      let key = host.lowercased()
      entries[key] = TrustedCertEntry(
        hostname: key,
        sha256Fingerprint: fingerprint.uppercased(),
        acceptedAt: Date().timeIntervalSince1970 * 1000,
        validTo: validTo)
      persist()
    }
  }

  func remove(host: String) {
    queue.sync {
      entries.removeValue(forKey: host.lowercased())
      persist()
    }
  }

  func clearAll() {
    queue.sync {
      entries.removeAll()
      persist()
    }
  }

  // MARK: fingerprint

  static func fingerprint(for certificate: SecCertificate) -> String {
    let data = SecCertificateCopyData(certificate) as Data
    let digest = SHA256.hash(data: data)
    return digest.map { String(format: "%02X", $0) }.joined(separator: ":")
  }

  // MARK: persistence

  private func load() {
    guard let raw = UserDefaults.standard.data(forKey: defaultsKey),
      let decoded = try? JSONDecoder().decode(
        [TrustedCertEntry].self, from: raw)
    else { return }
    for entry in decoded { entries[entry.hostname.lowercased()] = entry }
  }

  private func persist() {
    let list = Array(entries.values)
    guard let data = try? JSONEncoder().encode(list) else { return }
    UserDefaults.standard.set(data, forKey: defaultsKey)
  }
}
