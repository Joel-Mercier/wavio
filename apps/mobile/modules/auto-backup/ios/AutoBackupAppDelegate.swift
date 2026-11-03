import ExpoModulesCore

// BGTaskScheduler only accepts launch handlers registered before the app
// finishes launching, which is earlier than any module is created.
public class AutoBackupAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    AutoBackupCoordinator.shared.registerLaunchHandler()
    return true
  }
}
