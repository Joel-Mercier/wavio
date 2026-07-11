package expo.modules.ssltrust

import android.security.KeyChain
import expo.modules.kotlin.Promise
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

    // Launch the OS credential-store picker so the user selects a client
    // certificate for mTLS. Resolves with the chosen KeyChain alias, or null
    // if the user cancels / has no matching cert. Choosing an alias also grants
    // this app access to that key, which later `KeyChain.getPrivateKey` needs.
    AsyncFunction("chooseClientCertificate") { host: String?, promise: Promise ->
      val activity = appContext.currentActivity
        ?: throw Exceptions.MissingActivity()
      KeyChain.choosePrivateKeyAlias(
        activity,
        { alias -> promise.resolve(alias) },
        null,
        null,
        host,
        -1,
        null,
      )
    }

    // Replace the whole host->alias map (JS servers store is the source of
    // truth); the KeyManager reads it live.
    AsyncFunction("syncClientCertificates") { certs: Map<String, String> ->
      SslTrustStore.syncClientCertificates(certs)
    }

    AsyncFunction("getClientCertificates") {
      SslTrustStore.getClientCertificates()
    }
  }

  private fun installStatus(): Map<String, Any?> =
    mapOf(
      "installed" to SslTrustStore.installed,
      "error" to SslTrustStore.installError,
    )
}
