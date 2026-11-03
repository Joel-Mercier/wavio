Pod::Spec.new do |s|
  s.name           = 'AutoBackup'
  s.version        = '0.0.1'
  s.summary        = 'Scheduled automatic backups for Wavio'
  s.description    = 'Asks iOS for a daily background processing slot and hands it to JS, which writes the backup.'
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
