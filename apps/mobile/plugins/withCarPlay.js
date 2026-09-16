const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
} = require("expo/config-plugins");

const CAR_SCENE_DELEGATE_NAME = "CarSceneDelegate";
const MAIN_SCENE_DELEGATE_NAME = "MainSceneDelegate";

// react-native-carplay is a plain static library with no Swift module, so its
// header is exposed through the bridging header (see withCarPlayBridgingHeader)
// rather than imported here. connectWithInterfaceController:window: /
// disconnect are the library's own entry points: they flip RNCPStore's
// `connected` flag and emit didConnect / didDisconnect to JS. The window-less
// delegate variants are the ones CarPlay calls for audio apps — the
// toWindow:/fromWindow: pair is reserved for navigation apps and never fires.
const CAR_SCENE_DELEGATE_SWIFT = `import CarPlay

@available(iOS 14.0, *)
class CarSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    RNCarPlay.connect(with: interfaceController, window: nil)
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    RNCarPlay.disconnect()
  }
}
`;

const BRIDGING_HEADER_IMPORT = "#import <react-native-carplay/RNCarPlay.h>";

const APPEARANCE_FIX_NAME = "CarPlayAppearanceFix";

// react-native 0.86's -[RCTAppearance setColorScheme:] reads `.windows` on
// every connected scene, and a CPTemplateApplicationScene has none — so the
// app aborts the moment anything calls Appearance.setColorScheme() (Uniwind
// does, on mount and on every theme change) while a CarPlay head unit is
// attached. Fixed upstream in facebook/react-native#57876 (after 0.86.3); until
// that lands here, and because React-Core is consumed prebuilt so a source
// patch would never compile, the guarded loop is swizzled in at load time.
const APPEARANCE_FIX_OBJC = `#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

@interface ${APPEARANCE_FIX_NAME} : NSObject
@end

@implementation ${APPEARANCE_FIX_NAME}

+ (void)load {
  Class cls = NSClassFromString(@"RCTAppearance");
  SEL sel = NSSelectorFromString(@"setColorScheme:");
  Method method = cls ? class_getInstanceMethod(cls, sel) : NULL;
  if (!method) {
    return;
  }
  IMP replacement = imp_implementationWithBlock(^(id _self, NSString *style) {
    UIUserInterfaceStyle userInterfaceStyle = UIUserInterfaceStyleUnspecified;
    if ([style isEqualToString:@"light"]) {
      userInterfaceStyle = UIUserInterfaceStyleLight;
    } else if ([style isEqualToString:@"dark"]) {
      userInterfaceStyle = UIUserInterfaceStyleDark;
    }
    for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
      if (![scene isKindOfClass:[UIWindowScene class]]) {
        continue;
      }
      for (UIWindow *window in ((UIWindowScene *)scene).windows) {
        window.overrideUserInterfaceStyle = userInterfaceStyle;
      }
    }
  });
  method_setImplementation(method, replacement);
}

@end
`;

// Hosts the React Native root view in the new UIWindowScene. The generated
// AppDelegate builds its UIWindow with `UIWindow(frame:)` in
// didFinishLaunching, before any scene exists; CarPlay forces a
// UIApplicationSceneManifest, so that window has to be attached to the scene
// here or nothing renders. Simply assigning `windowScene` to the pre-scene
// window leaves it half-registered: on iOS 26 the system share sheet presented
// from it sizes itself for the long screen edge and lands as a corner popover
// (verified: a window born with `UIWindow(windowScene:)` hosting the same root
// view controller renders the sheet normally). So the root view controller is
// moved onto a scene-created window and the original is retired.
const MAIN_SCENE_DELEGATE_SWIFT = `import UIKit

class MainSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let launchWindow = appDelegate.window
    else { return }

    let sceneWindow = UIWindow(windowScene: windowScene)
    sceneWindow.backgroundColor = launchWindow.backgroundColor
    let rootViewController = launchWindow.rootViewController
    launchWindow.rootViewController = nil
    launchWindow.isHidden = true
    sceneWindow.rootViewController = rootViewController
    appDelegate.window = sceneWindow
    self.window = sceneWindow
    sceneWindow.makeKeyAndVisible()
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

// withBuildSourceFile both writes the file and links it into project.pbxproj;
// the project lists its sources explicitly, so a file merely dropped into
// ios/<app>/ would never compile and the scene delegate class names in the
// manifest would resolve to nothing.
const withSceneDelegateFiles = (config) => {
  config = IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: `${CAR_SCENE_DELEGATE_NAME}.swift`,
    contents: CAR_SCENE_DELEGATE_SWIFT,
    overwrite: true,
  });
  config = IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: `${MAIN_SCENE_DELEGATE_NAME}.swift`,
    contents: MAIN_SCENE_DELEGATE_SWIFT,
    overwrite: true,
  });
  return IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: `${APPEARANCE_FIX_NAME}.m`,
    contents: APPEARANCE_FIX_OBJC,
    overwrite: true,
  });
};

const withCarPlayBridgingHeader = (config) =>
  withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const header = path.join(
        cfg.modRequest.platformProjectRoot,
        cfg.modRequest.projectName,
        `${cfg.modRequest.projectName}-Bridging-Header.h`,
      );
      const current = fs.existsSync(header)
        ? fs.readFileSync(header, "utf8")
        : "";
      if (!current.includes(BRIDGING_HEADER_IMPORT)) {
        fs.writeFileSync(
          header,
          `${current.trimEnd()}\n${BRIDGING_HEADER_IMPORT}\n`,
        );
      }
      return cfg;
    },
  ]);

module.exports = (config) => {
  config = withCarPlayEntitlement(config);
  config = withCarPlayScene(config);
  config = withSceneDelegateFiles(config);
  config = withCarPlayBridgingHeader(config);
  return config;
};
