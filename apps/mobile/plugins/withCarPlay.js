const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
} = require("expo/config-plugins");

const SCENE_DELEGATE_NAME = "CarSceneDelegate";

const SCENE_DELEGATE_SWIFT = `import CarPlay
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
    const exists = carplayConfigs.some((c) =>
      c.UISceneDelegateClassName?.endsWith(SCENE_DELEGATE_NAME),
    );
    if (!exists) {
      carplayConfigs.push({
        UISceneClassName: "CPTemplateApplicationScene",
        UISceneConfigurationName: "CarPlayConfiguration",
        UISceneDelegateClassName: `$(PRODUCT_MODULE_NAME).${SCENE_DELEGATE_NAME}`,
      });
    }
    sceneCfg.CPTemplateApplicationSceneSessionRoleApplication = carplayConfigs;
    manifest.UISceneConfigurations = sceneCfg;
    cfg.modResults.UIApplicationSceneManifest = manifest;
    return cfg;
  });

const withSceneDelegateFile = (config) =>
  withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectName = cfg.modRequest.projectName;
      if (!projectName) return cfg;
      const dir = path.join(cfg.modRequest.platformProjectRoot, projectName);
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, `${SCENE_DELEGATE_NAME}.swift`);
      if (!fs.existsSync(target)) {
        fs.writeFileSync(target, SCENE_DELEGATE_SWIFT);
      }
      return cfg;
    },
  ]);

module.exports = (config) => {
  config = withCarPlayEntitlement(config);
  config = withCarPlayScene(config);
  config = withSceneDelegateFile(config);
  return config;
};
