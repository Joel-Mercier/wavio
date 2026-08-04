import ExpoModulesCore

// The split that matters to JS is permanent vs. transient: a permanent failure
// is cached so the track is never retried, a transient one is retried later.
// See services/waveform/cache.ts. Codes are spelled out to match the Android
// side (modules/audio-waveform/android/.../Exceptions.kt) exactly.

/// No audio track, no decoder, or a PCM format we don't read. Permanent.
final class WaveformUnsupportedException: GenericException<String> {
  override var code: String { "ERR_WAVEFORM_UNSUPPORTED" }
  override var reason: String { "Waveform unsupported: \(param)" }
}

/// The decoder failed part-way through a readable file. Permanent.
final class WaveformDecodeException: GenericException<String> {
  override var code: String { "ERR_WAVEFORM_DECODE" }
  override var reason: String { "Waveform decode failed: \(param)" }
}

/// The file is missing or unreadable right now. Transient.
final class WaveformSourceException: GenericException<String> {
  override var code: String { "ERR_WAVEFORM_SOURCE" }
  override var reason: String { "Waveform source unreadable: \(param)" }
}

/// Decode ran past its wall-clock deadline. Transient.
final class WaveformTimeoutException: GenericException<String> {
  override var code: String { "ERR_WAVEFORM_TIMEOUT" }
  override var reason: String { "Waveform decode timed out: \(param)" }
}
