const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
} = require("expo/config-plugins");

const CAR_SCENE_DELEGATE_NAME = "CarSceneDelegate";
const MAIN_SCENE_DELEGATE_NAME = "MainSceneDelegate";

const CAR_SCENE_DELEGATE_SWIFT = `import CarPlay
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
`;

// Adopts the AppDelegate-created UIWindow into the new UIWindowScene so the
// React Native root view actually renders. Required on iOS scene-based apps
// (which we are, because CarPlay forces UIApplicationSceneManifest).
const MAIN_SCENE_DELEGATE_SWIFT = `import UIKit

class MainSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    if let appDelegate = UIApplication.shared.delegate as? AppDelegate,
       let appWindow = appDelegate.window {
      appWindow.windowScene = windowScene
      self.window = appWindow
      appWindow.makeKeyAndVisible()
    }
  }
}
`;

const withCarPlayEntitlement = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.developer.carplay-audio"] = true;
    return cfg;
  });

const withCarPlayScene = (config) =>
  withInfoPlist(config, (cfg) => {
    const manifest = cfg.modResults.UIApplicationSceneManifest ?? {};
    const sceneCfg = manifest.UISceneConfigurations ?? {};
    const carplayConfigs =
      sceneCfg.CPTemplateApplicationSceneSessionRoleApplication ?? [];
    const carExists = carplayConfigs.some((c) =>
      c.UISceneDelegateClassName?.endsWith(CAR_SCENE_DELEGATE_NAME),
    );
    if (!carExists) {
      carplayConfigs.push({
        UISceneClassName: "CPTemplateApplicationScene",
        UISceneConfigurationName: "CarPlayConfiguration",
        UISceneDelegateClassName: `$(PRODUCT_MODULE_NAME).${CAR_SCENE_DELEGATE_NAME}`,
      });
    }
    sceneCfg.CPTemplateApplicationSceneSessionRoleApplication = carplayConfigs;

    const windowConfigs = sceneCfg.UIWindowSceneSessionRoleApplication ?? [];
    const mainExists = windowConfigs.some((c) =>
      c.UISceneDelegateClassName?.endsWith(MAIN_SCENE_DELEGATE_NAME),
    );
    if (!mainExists) {
      windowConfigs.push({
        UISceneConfigurationName: "Default Configuration",
        UISceneClassName: "UIWindowScene",
        UISceneDelegateClassName: `$(PRODUCT_MODULE_NAME).${MAIN_SCENE_DELEGATE_NAME}`,
      });
    }
    sceneCfg.UIWindowSceneSessionRoleApplication = windowConfigs;

    manifest.UISceneConfigurations = sceneCfg;
    cfg.modResults.UIApplicationSceneManifest = manifest;
    return cfg;
  });

const withSceneDelegateFiles = (config) =>
  withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectName = cfg.modRequest.projectName;
      if (!projectName) return cfg;
      const dir = path.join(cfg.modRequest.platformProjectRoot, projectName);
      fs.mkdirSync(dir, { recursive: true });

      const carTarget = path.join(dir, `${CAR_SCENE_DELEGATE_NAME}.swift`);
      if (!fs.existsSync(carTarget)) {
        fs.writeFileSync(carTarget, CAR_SCENE_DELEGATE_SWIFT);
      }

      const mainTarget = path.join(dir, `${MAIN_SCENE_DELEGATE_NAME}.swift`);
      fs.writeFileSync(mainTarget, MAIN_SCENE_DELEGATE_SWIFT);

      return cfg;
    },
  ]);

module.exports = (config) => {
  config = withCarPlayEntitlement(config);
  config = withCarPlayScene(config);
  config = withSceneDelegateFiles(config);
  return config;
};
