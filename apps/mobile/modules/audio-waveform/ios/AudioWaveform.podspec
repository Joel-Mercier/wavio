Pod::Spec.new do |s|
  s.name           = 'AudioWaveform'
  s.version        = '0.0.1'
  s.summary        = 'Audio waveform peak extraction for Wavio'
  s.description    = 'Decodes a local audio file to PCM and reduces it to a normalized RMS envelope for the waveform seekbar.'
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
