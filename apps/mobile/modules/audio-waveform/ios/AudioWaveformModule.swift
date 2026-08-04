import ExpoModulesCore

public class AudioWaveformModule: Module {
  // `AsyncFunction` otherwise runs on a queue shared by every Expo module, so a
  // multi-second decode there would stall unrelated native calls. Owning the
  // queue also serializes decodes, keeping one reader alive at a time.
  private let queue = DispatchQueue(label: "app.wavio.waveform", qos: .utility)

  public func definition() -> ModuleDefinition {
    Name("AudioWaveform")

    AsyncFunction("extractPeaks") { (uri: String, buckets: Int, maxDurationMs: Int64) -> [String: Any] in
      let result = try PeakExtractor.extract(
        uri: uri, buckets: buckets, maxDurationMs: maxDurationMs)
      return ["peaks": result.peaks, "durationMs": result.durationMs]
    }
    .runOnQueue(queue)
  }
}
