import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/**
 * Trust-On-First-Use (TOFU) SSL certificate trust.
 *
 * Self-hosted Navidrome / OpenSubsonic / Jellyfin servers are commonly exposed
 * over HTTPS with a self-signed (or otherwise untrusted) certificate, which the
 * OS TLS stack rejects — blocking login and every networking path. This module
 * lets the user inspect such a certificate once and trust it per host, after
 * which all traffic to that host is accepted.
 *
 * Platform mechanics differ (see the native sources):
 * - Android installs a global trust manager + OkHttp factory, so trusting a
 *   cert transparently covers axios, expo-image, expo-audio and downloads with
 *   no URL changes. `resolveServerBase` is a no-op there.
 * - iOS covers URLSession traffic (axios/fetch, expo-image, downloads) via a
 *   custom URLProtocol, but AVPlayer (expo-audio) ignores URLProtocols, so a
 *   loopback reverse proxy fronts trusted hosts and `resolveServerBase` rewrites
 *   the audio stream URL to it.
 */

export interface CertificateInfo {
  hostname: string;
  subject: string;
  issuer: string;
  sha256Fingerprint: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
  selfSigned: boolean;
  systemTrusted: boolean;
}

export interface TrustedCert {
  hostname: string;
  sha256Fingerprint: string;
  acceptedAt: number;
  validTo?: string;
}

export interface TrustStoreInstallStatus {
  installed: boolean;
  error?: string;
}

export interface ProxyUpstream {
  baseUrl: string;
  token: string;
}

export interface ProxyInfo {
  port: number;
  upstreams: ProxyUpstream[];
}

/** A host mapped to the Android KeyChain alias used for its mTLS client cert. */
export interface ClientCertMapping {
  hostname: string;
  alias: string;
}

type SslTrustNativeModule = {
  initTrustStore(): Promise<TrustStoreInstallStatus>;
  getInstallStatus(): Promise<TrustStoreInstallStatus>;
  getCertificateInfo(url: string): Promise<CertificateInfo>;
  trustCertificate(
    hostname: string,
    sha256Fingerprint: string,
    validTo: string | null,
  ): Promise<void>;
  removeTrustedCertificate(hostname: string): Promise<void>;
  clearAllTrustedCertificates(): Promise<void>;
  getTrustedCertificates(): Promise<TrustedCert[]>;
  isCertificateTrusted(hostname: string): Promise<boolean>;
  // Android-only mTLS client-cert controls; absent on iOS.
  chooseClientCertificate?(host: string | null): Promise<string | null>;
  syncClientCertificates?(certs: Record<string, string>): Promise<void>;
  getClientCertificates?(): Promise<ClientCertMapping[]>;
  // iOS-only proxy controls; absent on Android.
  syncProxyUpstreams?(baseUrls: string[]): Promise<ProxyInfo | null>;
  getProxyInfo?(): Promise<ProxyInfo | null>;
};

// Autolinked from `modules/ssl-trust` (registered as `SslTrust` via the Expo
// Modules API on Android and iOS). Optional so importing this file never throws
// before a native rebuild / on web / under jest.
const Native = requireOptionalNativeModule<SslTrustNativeModule>("SslTrust");

/** Whether the native module is linked in the current binary. */
export const isSslTrustAvailable = (): boolean => Native != null;

/**
 * Whether the Android mTLS client-cert picker is callable in this binary.
 * False on iOS/web, and on an Android binary built before the client-cert
 * functions were added (module present, new AsyncFunction absent) — lets the UI
 * show a "rebuild required" hint instead of a silently dead button.
 */
export const isClientCertPickerAvailable = (): boolean =>
  Platform.OS === "android" && !!Native?.chooseClientCertificate;

export async function initTrustStore(): Promise<TrustStoreInstallStatus> {
  if (!Native) return { installed: false, error: "native module unavailable" };
  return Native.initTrustStore();
}

export async function getInstallStatus(): Promise<TrustStoreInstallStatus> {
  if (!Native) return { installed: false, error: "native module unavailable" };
  return Native.getInstallStatus();
}

export async function getCertificateInfo(
  url: string,
): Promise<CertificateInfo> {
  if (!Native) throw new Error("SslTrust native module unavailable");
  return Native.getCertificateInfo(url);
}

export async function trustCertificate(
  hostname: string,
  sha256Fingerprint: string,
  validTo?: string,
): Promise<void> {
  if (!Native) throw new Error("SslTrust native module unavailable");
  await Native.trustCertificate(hostname, sha256Fingerprint, validTo ?? null);
}

export async function removeTrustedCertificate(
  hostname: string,
): Promise<void> {
  if (!Native) return;
  await Native.removeTrustedCertificate(hostname);
}

export async function clearAllTrustedCertificates(): Promise<void> {
  if (!Native) return;
  await Native.clearAllTrustedCertificates();
}

export async function getTrustedCertificates(): Promise<TrustedCert[]> {
  if (!Native) return [];
  return Native.getTrustedCertificates();
}

export async function isCertificateTrusted(hostname: string): Promise<boolean> {
  if (!Native) return false;
  return Native.isCertificateTrusted(hostname);
}

// --- mTLS client certificates (Android) --------------------------------------

/**
 * Extract the lowercased hostname from a URL (no scheme/port/path), for keying
 * the host->alias mTLS map. Returns "" when no host can be parsed.
 */
export function hostnameFromUrl(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * Launch the Android system credential-store picker to select a client
 * certificate for mTLS. Resolves with the chosen KeyChain alias, or null on
 * cancel / no available cert / non-Android. `host` is an optional hint shown in
 * the chooser.
 */
export async function chooseClientCertificate(
  host?: string | null,
): Promise<string | null> {
  if (Platform.OS !== "android" || !Native?.chooseClientCertificate)
    return null;
  return Native.chooseClientCertificate(host ?? null);
}

/**
 * Replace the native host->alias map (the JS servers store is the source of
 * truth). The native KeyManager reads it live, so this takes effect without a
 * TLS re-init. No-op off Android.
 */
export async function syncClientCertificates(
  certs: Record<string, string>,
): Promise<void> {
  if (Platform.OS !== "android" || !Native?.syncClientCertificates) return;
  await Native.syncClientCertificates(certs);
}

export async function getClientCertificates(): Promise<ClientCertMapping[]> {
  if (Platform.OS !== "android" || !Native?.getClientCertificates) return [];
  return Native.getClientCertificates();
}

// --- iOS loopback proxy ------------------------------------------------------

let cachedProxyInfo: ProxyInfo | null = null;

/** Test-only seam to inject proxy state without the native module. */
export function __setProxyInfoForTests(info: ProxyInfo | null): void {
  cachedProxyInfo = info;
}

/**
 * Normalize a URL to a comparable `scheme://host[:port]` origin (lowercase, no
 * path/query). Used to match a request URL against a trusted upstream.
 */
export function normalizeBase(url: string): string {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/:?#]+)(?::(\d+))?/i.exec(url.trim());
  if (!m) return url.trim().toLowerCase().replace(/\/+$/, "");
  const port = m[3] ? `:${m[3]}` : "";
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${port}`;
}

/**
 * On iOS, rewrite a URL whose origin is a trusted self-signed upstream to the
 * local loopback proxy (`http://127.0.0.1:<port>/<token>...`) so AVPlayer can
 * stream it. Returns the URL unchanged on Android, when no proxy is running, or
 * when the origin isn't a trusted upstream.
 */
export function resolveServerBase(url: string): string {
  if (Platform.OS !== "ios" || !cachedProxyInfo) return url;
  const norm = normalizeBase(url);
  const match = cachedProxyInfo.upstreams.find(
    (u) => normalizeBase(u.baseUrl) === norm,
  );
  if (!match) return url;
  const rest = url.slice(norm.length);
  return `http://127.0.0.1:${cachedProxyInfo.port}/${match.token}${rest}`;
}

/**
 * Re-register the set of trusted upstreams with the native proxy (iOS only).
 * On failure the cached proxy info is cleared (so `resolveServerBase` stops
 * routing to a proxy we couldn't (re)start) and the error is re-thrown — the
 * module stays free of app/Sentry dependencies, so the services-layer caller
 * does the reporting (mirrors how the other local modules surface failures).
 */
export async function refreshProxyUpstreams(baseUrls: string[]): Promise<void> {
  if (Platform.OS !== "ios" || !Native?.syncProxyUpstreams) return;
  try {
    cachedProxyInfo = await Native.syncProxyUpstreams(baseUrls);
  } catch (err) {
    cachedProxyInfo = null;
    throw err;
  }
}

/** Refresh the cached proxy info (iOS only), e.g. on app foreground. */
export async function refreshProxyInfo(): Promise<void> {
  if (Platform.OS !== "ios" || !Native?.getProxyInfo) return;
  try {
    cachedProxyInfo = await Native.getProxyInfo();
  } catch {
    /* keep the last known info */
  }
}

// --- error classification ----------------------------------------------------

// Substrings (lowercased) found in TLS validation failures across axios/fetch,
// expo-image and the native layers on both platforms.
const SSL_ERROR_PATTERNS = [
  "certificate",
  "ssl",
  "tls",
  "cert_",
  "self-signed",
  "self signed",
  "untrusted",
  "trust anchor",
  "trustkit",
  "javax.net.ssl",
  "sslhandshake",
  "x509",
  "unable to verify",
  "secure connection",
  "err_cert",
  "-1202", // NSURLErrorServerCertificateUntrusted
  "-1200", // NSURLErrorSecureConnectionFailed
];

/** Heuristic: does this error message look like a TLS/certificate failure? */
export function isSSLError(errorMessage: string | undefined | null): boolean {
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return SSL_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}
