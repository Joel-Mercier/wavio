import AVFoundation
import ExpoModulesCore

private let hardDeadline: TimeInterval = 30

struct PeakResult {
  let peaks: [Int]
  let durationMs: Int64
}

enum PeakExtractor {
  static func extract(uri: String, buckets: Int, maxDurationMs: Int64) throws -> PeakResult {
    let url: URL
    if let parsed = URL(string: uri), parsed.scheme != nil {
      url = parsed
    } else {
      url = URL(fileURLWithPath: uri)
    }

    // AVURLAsset infers the container from the file EXTENSION for file:// URLs,
    // unlike Android's extractor which sniffs content. A temp file named without
    // a real extension fails here and only here, which reads as an iOS-only
    // decoder bug — hence the out-of-band MIME hint as a second line of defence.
    var options: [String: Any] = [:]
    if let mime = mimeType(for: url.pathExtension.lowercased()) {
      options["AVURLAssetOutOfBandMIMETypeKey"] = mime
    }
    let asset = AVURLAsset(url: url, options: options)

    // Refuse before starting a reader: a long file otherwise decodes until the
    // wall-clock deadline for a waveform that would be unreadable anyway. A
    // container with no usable duration falls through, which is what the
    // deadline is still there for.
    let declaredSeconds = CMTimeGetSeconds(asset.duration)
    if maxDurationMs > 0, declaredSeconds.isFinite,
      declaredSeconds * 1000 > Double(maxDurationMs)
    {
      throw WaveformUnsupportedException(
        "track is \(Int(declaredSeconds))s, over the \(maxDurationMs / 1000)s analysis limit")
    }

    guard let track = asset.tracks(withMediaType: .audio).first else {
      throw WaveformUnsupportedException("no audio track")
    }
    guard
      let formatDescription = track.formatDescriptions.first,
      let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(
        formatDescription as! CMAudioFormatDescription)?.pointee
    else {
      throw WaveformUnsupportedException("no audio format description")
    }
    // The source's rate seeds the accumulator and is corrected below once the
    // decoder declares its own: SBR formats (HE-AAC) decode at twice the rate in
    // the container's ASBD, so trusting this one halves the reported duration.
    let sourceChannels = max(1, Int(asbd.mChannelsPerFrame))
    let sourceRate = asbd.mSampleRate > 0 ? asbd.mSampleRate : 44_100

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw WaveformSourceException("cannot read \(uri): \(error.localizedDescription)")
    }

    // Deliberately no AVNumberOfChannelsKey: requesting a channel-count change
    // makes the reader fail opaquely for some source layouts. Downmix below
    // instead, which also matches what the Android path does.
    let output = AVAssetReaderTrackOutput(
      track: track,
      outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsNonInterleaved: false,
      ])
    output.alwaysCopiesSampleData = false

    guard reader.canAdd(output) else {
      throw WaveformUnsupportedException("cannot decode track to PCM")
    }
    reader.add(output)
    guard reader.startReading() else {
      throw WaveformDecodeException(reader.error?.localizedDescription ?? "reader failed to start")
    }

    // Only a seed for the accumulator's initial resolution — a wrong value costs
    // an extra fold, never correctness.
    let estimatedFrames = declaredSeconds.isFinite && declaredSeconds > 0
      ? Int64(declaredSeconds * sourceRate)
      : 0
    let accumulator = FoldingAccumulator(estimatedFrames: estimatedFrames)

    let deadline = Date().addingTimeInterval(hardDeadline)
    var scratch = [Int16]()
    // What the reader actually emits, which is what the frame count counts.
    var outputRate = sourceRate
    var channels = sourceChannels

    while reader.status == .reading {
      if Date() > deadline {
        reader.cancelReading()
        throw WaveformTimeoutException("decode exceeded \(Int(hardDeadline))s")
      }
      guard let sampleBuffer = output.copyNextSampleBuffer() else { break }
      if let outputFormat = CMSampleBufferGetFormatDescription(sampleBuffer),
        let outputAsbd = CMAudioFormatDescriptionGetStreamBasicDescription(outputFormat)?.pointee
      {
        if outputAsbd.mSampleRate > 0 { outputRate = outputAsbd.mSampleRate }
        if outputAsbd.mChannelsPerFrame > 0 { channels = Int(outputAsbd.mChannelsPerFrame) }
      }
      // Without the pool, the per-buffer allocations are only released at the
      // end of the loop and memory balloons on long files.
      autoreleasepool {
        if let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) {
          let byteCount = CMBlockBufferGetDataLength(blockBuffer)
          let sampleCount = byteCount / MemoryLayout<Int16>.size
          if sampleCount > 0 {
            if scratch.count < sampleCount {
              scratch = [Int16](repeating: 0, count: sampleCount)
            }
            // CMBlockBufferGetDataPointer can hand back a non-contiguous buffer;
            // the copy is always correct and costs one memcpy per block.
            let copied = scratch.withUnsafeMutableBytes { raw -> OSStatus in
              guard let base = raw.baseAddress else { return -1 }
              return CMBlockBufferCopyDataBytes(
                blockBuffer, atOffset: 0, dataLength: byteCount, destination: base)
            }
            if copied == kCMBlockBufferNoErr {
              accumulate(scratch, count: sampleCount, channels: channels, into: accumulator)
            }
          }
        }
        CMSampleBufferInvalidate(sampleBuffer)
      }
    }

    // A nil sample buffer is not proof of success — a mid-stream failure also
    // ends the loop, and would otherwise yield a silently truncated waveform.
    guard reader.status == .completed else {
      if reader.status == .cancelled {
        throw WaveformTimeoutException("decode cancelled")
      }
      throw WaveformDecodeException(reader.error?.localizedDescription ?? "decode failed")
    }

    // The decoder's own frame count is exact, unlike a VBR container's header.
    let durationMs = Int64(Double(accumulator.frames) / outputRate * 1000)
    return PeakResult(peaks: accumulator.peaks(buckets: buckets), durationMs: durationMs)
  }

  private static func accumulate(
    _ samples: [Int16], count: Int, channels: Int, into accumulator: FoldingAccumulator
  ) {
    let frames = count / channels
    guard frames > 0 else { return }
    samples.withUnsafeBufferPointer { buffer in
      for f in 0..<frames {
        var sum = 0.0
        for c in 0..<channels {
          sum += Double(buffer[f * channels + c]) / 32768.0
        }
        accumulator.push(sum / Double(channels))
      }
    }
  }

  private static func mimeType(for ext: String) -> String? {
    switch ext {
    case "mp3": return "audio/mpeg"
    case "m4a", "m4b", "aac", "mp4": return "audio/mp4"
    case "flac": return "audio/flac"
    case "opus", "ogg", "oga": return "audio/ogg"
    case "wav": return "audio/wav"
    case "aiff", "aif": return "audio/aiff"
    default: return nil
    }
  }
}
