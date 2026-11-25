import AVFoundation
import AVKit
import ExpoModulesCore

/**
 AirPlay as an output on iOS.

 This is how iOS apps put on-device audio on a speaker or a TV: the app keeps playing
 through its own player, iOS carries the audio to the AirPlay device, and the app
 stays alive in the background because it *is* playing audio. Chromecast and UPnP
 work the other way round — the receiver fetches a URL — which for a library on this
 phone means serving it, and iOS suspends a backgrounded app that serves without
 playing (see modules/cast-server/ios/CastServer.swift). AirPlay has no such problem,
 and the phone decodes, so every format the app plays here plays there too.

 There is no public API to open the route picker programmatically, so the system's
 own button is the view, laid over the output sheet's row.
 */
public class AirPlayRouteModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AirPlayRoute")

    Events("onRouteChange")

    Function("currentRoute") { () -> [String: Any] in
      AirPlayRouteModule.describeRoute()
    }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onRouteChange", AirPlayRouteModule.describeRoute())
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observer = nil
    }

    View(AirPlayRouteView.self) {
      Prop("tint") { (view: AirPlayRouteView, color: UIColor?) in
        view.picker.tintColor = color
      }
      Prop("activeTint") { (view: AirPlayRouteView, color: UIColor?) in
        view.picker.activeTintColor = color
      }
    }
  }

  private static func describeRoute() -> [String: Any] {
    let output = AVAudioSession.sharedInstance().currentRoute.outputs.first
    return [
      "name": output?.portName ?? "",
      "airPlay": output?.portType == .airPlay,
      "external": output.map { $0.portType != .builtInSpeaker && $0.portType != .builtInReceiver }
        ?? false,
    ]
  }
}

public final class AirPlayRouteView: ExpoView {
  let picker = AVRoutePickerView()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    picker.prioritizesVideoDevices = false
    addSubview(picker)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
