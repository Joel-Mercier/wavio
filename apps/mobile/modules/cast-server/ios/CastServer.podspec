Pod::Spec.new do |s|
  s.name           = 'CastServer'
  s.version        = '0.0.1'
  s.summary        = 'Serves a local library to Chromecast and UPnP receivers for Wavio'
  s.description    = 'A small HTTP server on the Wi-Fi address that serves the registered tracks and covers of an active cast session, from files on the device or relayed from an upstream HTTP source.'
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
