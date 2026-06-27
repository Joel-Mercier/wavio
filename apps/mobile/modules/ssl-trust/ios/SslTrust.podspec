Pod::Spec.new do |s|
  s.name           = 'SslTrust'
  s.version        = '0.0.1'
  s.summary        = 'Trust-On-First-Use SSL certificate trust for Wavio'
  s.description    = 'Lets users inspect and trust self-signed / untrusted TLS certificates per host, so self-hosted servers over HTTPS work across fetch, images, downloads and audio streaming.'
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

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
