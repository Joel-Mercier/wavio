Pod::Spec.new do |s|
  s.name           = 'ScopedFolders'
  s.version        = '0.0.1'
  s.summary        = 'Persistent access to user-picked folders for Wavio'
  s.description    = 'Presents the Files folder picker and keeps the resulting security-scoped access alive across launches through bookmarks.'
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
