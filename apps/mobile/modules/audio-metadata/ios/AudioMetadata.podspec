Pod::Spec.new do |s|
  s.name           = 'AudioMetadata'
  s.version        = '0.0.1'
  s.summary        = 'Local audio file metadata extraction for Wavio'
  s.description    = 'Extracts ID3 / Vorbis-comment / MP4-atom tags from local audio files using AVFoundation.'
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
