import Foundation

/**
 Reduces an arbitrarily long PCM stream to a fixed-size RMS envelope in O(1)
 memory, without knowing the total sample count up front. Mirrors
 `FoldingAccumulator.kt` exactly so both platforms produce the same shape.

 Deriving samples-per-bucket from the asset's declared duration looks simpler but
 is wrong often enough to matter (VBR sources, missing durations). Instead
 samples land in `slots` fine-grained slots; when they fill, adjacent pairs merge
 and the frames-per-slot doubles, so a bad initial estimate costs a few folds
 rather than a wrong waveform.
 */
final class FoldingAccumulator {
  // 4096 slots = 32 KB of scratch, and >=4x oversampling of the 1024 buckets the
  // app stores, so the resample below never aliases.
  private static let slots = 4096

  private var sums = [Double](repeating: 0, count: FoldingAccumulator.slots)
  private var counts = [Int64](repeating: 0, count: FoldingAccumulator.slots)
  private var framesPerSlot: Int64
  private var slot = 0
  private var inSlot: Int64 = 0
  private(set) var frames: Int64 = 0

  init(estimatedFrames: Int64) {
    framesPerSlot = max(1, estimatedFrames > 0 ? estimatedFrames / Int64(FoldingAccumulator.slots) : 1024)
  }

  /// Feed one mono frame, already downmixed and normalized to -1...1.
  func push(_ sample: Double) {
    frames += 1
    sums[slot] += sample * sample
    counts[slot] += 1
    inSlot += 1
    if inSlot >= framesPerSlot {
      inSlot = 0
      slot += 1
      if slot == FoldingAccumulator.slots { fold() }
    }
  }

  /// Merge adjacent slot pairs, halving resolution and doubling the slot span.
  private func fold() {
    let half = FoldingAccumulator.slots / 2
    for i in 0..<half {
      sums[i] = sums[2 * i] + sums[2 * i + 1]
      counts[i] = counts[2 * i] + counts[2 * i + 1]
    }
    for i in half..<FoldingAccumulator.slots {
      sums[i] = 0
      counts[i] = 0
    }
    slot = half
    framesPerSlot *= 2
  }

  /**
   Resample the filled slots down to `buckets` values quantized to 0...255.
   Quantization is visually lossless at the heights the seekbar draws, and keeps
   a cached row at ~1 byte per bucket.
   */
  func peaks(buckets: Int) -> [Int] {
    let filled = inSlot > 0 ? slot + 1 : slot
    var out = [Int](repeating: 0, count: buckets)
    guard filled > 0, buckets > 0 else { return out }

    var rms = [Double](repeating: 0, count: filled)
    var peak = 0.0
    for i in 0..<filled {
      let c = counts[i]
      rms[i] = c > 0 ? (sums[i] / Double(c)).squareRoot() : 0
      if rms[i] > peak { peak = rms[i] }
    }
    // Scale against the loudest window rather than full scale: a quiet master
    // would otherwise render as a flat line. Per-bar contrast shaping happens in
    // JS (see components/player/waveform/geometry.ts), which needs the shape,
    // not the absolute level.
    let scale = peak > 0 ? 255.0 / peak : 0

    for b in 0..<buckets {
      let start = Int(Int64(b) * Int64(filled) / Int64(buckets))
      let end = max(start + 1, Int(Int64(b + 1) * Int64(filled) / Int64(buckets)))
      var acc = 0.0
      var n = 0
      for i in start..<min(end, filled) {
        acc += rms[i]
        n += 1
      }
      let mean = n > 0 ? acc / Double(n) : 0
      out[b] = min(255, max(0, Int((mean * scale).rounded())))
    }
    return out
  }
}
