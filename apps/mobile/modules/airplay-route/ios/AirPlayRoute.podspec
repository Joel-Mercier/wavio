Pod::Spec.new do |s|
  s.name           = 'AirPlayRoute'
  s.version        = '0.0.1'
  s.summary        = 'AirPlay output picker for Wavio'
  s.description    = 'Wraps AVRoutePickerView and reports the current audio route, so the output sheet can offer AirPlay speakers and TVs.'
  s.author         = ''
  s.homepage       = 'https://wavio.app'
  s.platforms      = {
    :ios => '15.1'
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
