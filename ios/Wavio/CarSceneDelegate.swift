import CarPlay
import RNCarPlay

@available(iOS 14.0, *)
class CarSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController,
    to window: CPWindow
  ) {
    RNCPStore.shared().interfaceController = interfaceController
    RNCPStore.shared().window = window
    NotificationCenter.default.post(name: NSNotification.Name("RNCarPlayDidConnect"), object: nil)
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    RNCPStore.shared().interfaceController = nil
    NotificationCenter.default.post(name: NSNotification.Name("RNCarPlayDidDisconnect"), object: nil)
  }
}
