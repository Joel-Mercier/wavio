import ExpoModulesCore

// iOS counterpart of the Android tagger. Writing tags on iOS would need TagLib
// cross-compiled for Apple platforms and a different file-access model (no
// Storage Access Framework), so it is deliberately unimplemented: the JS layer
// treats a throwing/absent module as "file writing unavailable" and falls back
// to the in-app override layer, which is fully supported on iOS.
public class AudioTaggerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioTagger")

    Function("isAvailable") {
      false
    }

    AsyncFunction("writeTags") { (_: String, _: String) in
      throw Exception(
        name: "AudioTaggerUnavailable",
        description: "Writing tags into files is not supported on iOS"
      )
    }
  }
}
