package expo.modules.audiowaveform

import expo.modules.kotlin.exception.CodedException

// The split that matters to JS is permanent vs. transient: a permanent failure
// is cached so the track is never retried, a transient one is retried later.
// See services/waveform/cache.ts. Codes are passed explicitly rather than left
// to CodedException's class-name inference so a rename can't silently change
// the contract JS switches on.
sealed class CodecFailure(code: String, message: String) :
  CodedException(code, message, null)

/** No audio track, no decoder, or a PCM format we don't read. Permanent. */
class WaveformUnsupportedException(message: String) :
  CodecFailure("ERR_WAVEFORM_UNSUPPORTED", message)

/** The decoder failed part-way through a readable file. Permanent. */
class WaveformDecodeException(message: String) :
  CodecFailure("ERR_WAVEFORM_DECODE", message)

/** The file is missing or unreadable right now. Transient. */
class WaveformSourceException(message: String) :
  CodecFailure("ERR_WAVEFORM_SOURCE", message)

/** Decode ran past its wall-clock deadline. Transient. */
class WaveformTimeoutException(message: String) :
  CodecFailure("ERR_WAVEFORM_TIMEOUT", message)
