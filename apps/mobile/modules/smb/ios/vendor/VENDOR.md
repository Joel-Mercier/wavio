# Vendored: SMBClient

`SMBClient/` is a verbatim copy of `Sources/SMBClient/` from

- **Upstream:** https://github.com/kishikawakatsumi/SMBClient
- **Commit:** `66eafaa6d17e034e8036dee4b3ebc1b52cb53919` (2026-04-26)
- **Licence:** MIT — `SMBClient/LICENSE` is the upstream `LICENSE`, copied alongside
  the sources.

## Why vendored rather than a dependency

Upstream ships SPM only — there is no podspec — and the Expo module build is
CocoaPods. Vendoring under `ios/` means `Smb.podspec`'s `**/*.{h,m,mm,swift,hpp,cpp}`
glob picks the sources up with no extra configuration. It is pure Swift with no
third-party dependencies (only `Foundation`, `CommonCrypto` and `Network`), so there
is nothing else to resolve.

## Why this library and not the obvious ones

The Android side uses smbj because it is Apache-2.0 (see
`modules/smb/android/build.gradle`). The same constraint applies here: Wavio ships
under MIT through the App Store, and the usual iOS candidates — `AMSMB2`, `libsmb2`,
`libdsm` — are all LGPL-2.1, which carries relinking obligations that don't survive
store distribution. SMBClient is MIT.

## Known limitation: SMB 2.x only

`Session.negotiate` defaults to `[.smb202, .smb210]`, `Auth/Crypto.swift` implements
only HMAC-MD5 and HMAC-SHA256 (no AES-CMAC), and `Negotiate.Request` always sends an
empty `negotiateContextList`. So despite `Negotiate.Dialects` listing 3.0 / 3.0.2 /
3.1.1, SMB 3.x signing and pre-auth integrity are not implemented and those dialects
must not be requested.

A server configured with `server min protocol = SMB3` refuses the negotiate; the
module maps that to `ERR_SMB_DIALECT` so the user gets advice they can act on rather
than a generic "unreachable". Samba, Synology and QNAP all accept SMB2.1 by default,
so this affects a minority of setups. Android has no such limit — smbj negotiates
through 3.1.1 with encryption.

## Local modifications

None. The sources are unmodified upstream. Because the licence is MIT we *can* patch
in place (adding SMB 3.x signing would be the obvious reason), but anything changed
must be recorded here so the next re-vendor doesn't silently drop it.

## Re-vendoring

```sh
git clone --depth 1 https://github.com/kishikawakatsumi/SMBClient.git
cp -R SMBClient/Sources/SMBClient/. apps/mobile/modules/smb/ios/vendor/SMBClient/
cp SMBClient/LICENSE apps/mobile/modules/smb/ios/vendor/SMBClient/LICENSE
```

Then update the commit above, re-check the imports (`Foundation`, `CommonCrypto`,
`Network` only — anything new needs a podspec change), and re-check that the public
API `SmbStore.swift` calls still exists: `SMBClient(host:port:)`, `login`,
`connectShare`, `listDirectory`, `existFile`, `existDirectory`, `fileReader`,
`FileReader.read(offset:length:)` / `fileSize` / `close`, `logoff`.
