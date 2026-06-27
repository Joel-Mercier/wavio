package expo.modules.ssltrust

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SslTrustModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SslTrust")

    AsyncFunction("initTrustStore") {
      val context = appContext.reactContext
        ?: throw Exceptions.ReactContextLost()
      SslTrustStore.init(context)
      installStatus()
    }

    AsyncFunction("getInstallStatus") {
      installStatus()
    }

    AsyncFunction("getCertificateInfo") { url: String ->
      CertificateInspector.inspect(url)
    }

    AsyncFunction("trustCertificate") {
      hostname: String, sha256Fingerprint: String, validTo: String? ->
      SslTrustStore.trust(hostname, sha256Fingerprint, validTo)
    }

    AsyncFunction("removeTrustedCertificate") { hostname: String ->
      SslTrustStore.remove(hostname)
    }

    AsyncFunction("clearAllTrustedCertificates") {
      SslTrustStore.clearAll()
    }

    AsyncFunction("getTrustedCertificates") {
      SslTrustStore.getTrustedCertificates()
    }

    AsyncFunction("isCertificateTrusted") { hostname: String ->
      SslTrustStore.isCertificateTrusted(hostname)
    }
  }

  private fun installStatus(): Map<String, Any?> =
    mapOf(
      "installed" to SslTrustStore.installed,
      "error" to SslTrustStore.installError,
    )
}
