Pod::Spec.new do |s|
  s.name           = 'Smb'
  s.version        = '0.0.1'
  s.summary        = 'SMB network file share access for Wavio'
  s.description    = 'Lists and reads an SMB2 share, and fronts it with a loopback HTTP bridge so the player, metadata reader, waveform analyser and downloader can treat it as an ordinary HTTP resource.'
  s.author         = ''
  s.homepage       = 'https://wavio.app'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # Picks up vendor/SMBClient too — the glob is relative to this directory, which
  # is why the vendored sources live under ios/ rather than beside it. See
  # vendor/VENDOR.md.
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
