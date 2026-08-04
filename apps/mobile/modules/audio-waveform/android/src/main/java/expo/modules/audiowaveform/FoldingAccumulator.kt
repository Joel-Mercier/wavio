package expo.modules.audiowaveform

import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Reduces an arbitrarily long PCM stream to a fixed-size RMS envelope in O(1)
 * memory, without knowing the total sample count up front.
 *
 * Deriving samples-per-bucket from the container's duration looks simpler but is
 * wrong often enough to matter: VBR MP3 without a Xing header reports a guess,
 * HE-AAC's SBR doubles the decoder's output rate relative to the declared
 * format, and some containers omit the duration entirely. Instead, samples land
 * in `SLOTS` fine-grained slots; when they fill, adjacent pairs are merged and
 * the frames-per-slot doubles. A bad initial estimate costs a few folds rather
 * than a wrong or truncated waveform.
 */
class FoldingAccumulator(estimatedFrames: Long) {
  private val sums = DoubleArray(SLOTS)
  private val counts = LongArray(SLOTS)
  private var framesPerSlot: Long =
    max(1L, if (estimatedFrames > 0) estimatedFrames / SLOTS else 1024L)
  private var slot = 0
  private var inSlot = 0L
  private var totalFrames = 0L

  /** Feed one mono frame, already downmixed and normalized to -1..1. */
  fun push(sample: Double) {
    totalFrames++
    sums[slot] += sample * sample
    counts[slot]++
    if (++inSlot >= framesPerSlot) {
      inSlot = 0
      if (++slot == SLOTS) fold()
    }
  }

  /** Merge adjacent slot pairs, halving resolution and doubling the slot span. */
  private fun fold() {
    val half = SLOTS / 2
    for (i in 0 until half) {
      sums[i] = sums[2 * i] + sums[2 * i + 1]
      counts[i] = counts[2 * i] + counts[2 * i + 1]
    }
    java.util.Arrays.fill(sums, half, SLOTS, 0.0)
    java.util.Arrays.fill(counts, half, SLOTS, 0L)
    slot = half
    framesPerSlot *= 2
  }

  fun frames(): Long = totalFrames

  /**
   * Resample the filled slots down to [buckets] values quantized to 0..255.
   * Quantization is visually lossless at the heights the seekbar draws, and
   * keeps a cached row at ~1 byte per bucket.
   */
  fun toPeaks(buckets: Int): IntArray {
    val filled = if (inSlot > 0) slot + 1 else slot
    val out = IntArray(buckets)
    if (filled <= 0) return out

    val rms = DoubleArray(filled)
    var peak = 0.0
    for (i in 0 until filled) {
      val c = counts[i]
      rms[i] = if (c > 0) sqrt(sums[i] / c) else 0.0
      if (rms[i] > peak) peak = rms[i]
    }
    // Scale against the loudest window rather than full scale: a quiet master
    // would otherwise render as a flat line. Per-bar contrast shaping happens in
    // JS (see components/player/waveform/geometry.ts), which needs the shape,
    // not the absolute level.
    val scale = if (peak > 0) 255.0 / peak else 0.0

    for (b in 0 until buckets) {
      val start = (b.toLong() * filled / buckets).toInt()
      val end = max(start + 1, ((b + 1).toLong() * filled / buckets).toInt())
      var acc = 0.0
      var n = 0
      for (i in start until min(end, filled)) {
        acc += rms[i]
        n++
      }
      val mean = if (n > 0) acc / n else 0.0
      out[b] = min(255, max(0, Math.round(mean * scale).toInt()))
    }
    return out
  }

  companion object {
    // 4096 slots = 32 KB of scratch, and >=4x oversampling of the 1024 buckets
    // the app stores, so the resample below never aliases.
    const val SLOTS = 4096
  }
}
