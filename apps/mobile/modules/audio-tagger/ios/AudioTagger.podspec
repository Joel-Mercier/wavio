Pod::Spec.new do |s|
  s.name           = 'AudioTagger'
  s.version        = '0.0.1'
  s.summary        = 'Audio file tag writing for Wavio'
  s.description    = 'Writes corrected tags into local audio files. Android-only; the iOS target reports the capability as unavailable.'
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
