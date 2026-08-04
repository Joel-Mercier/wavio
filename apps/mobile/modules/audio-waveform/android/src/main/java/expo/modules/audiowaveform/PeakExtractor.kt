package expo.modules.audiowaveform

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import java.nio.ByteBuffer
import java.nio.ByteOrder

private const val DEQUEUE_TIMEOUT_US = 5_000L
private const val HARD_DEADLINE_MS = 30_000L

class PeakResult(val peaks: IntArray, val durationMs: Long)

object PeakExtractor {
  fun extract(context: Context?, uri: String, buckets: Int, maxDurationMs: Long): PeakResult {
    var pfd: ParcelFileDescriptor? = null
    val extractor = MediaExtractor()
    try {
      pfd = openDataSource(context, uri, extractor)
      val trackIndex = selectAudioTrack(extractor)
      val format = extractor.getTrackFormat(trackIndex)
      extractor.selectTrack(trackIndex)
      return decode(extractor, format, buckets, maxDurationMs)
    } finally {
      // The extractor holds the fd, so it has to be released before the fd is
      // closed or reads can fail mid-teardown on some ROMs.
      runCatching { extractor.release() }
      runCatching { pfd?.close() }
    }
  }

  private fun openDataSource(
    context: Context?,
    uri: String,
    extractor: MediaExtractor,
  ): ParcelFileDescriptor? {
    val parsed = Uri.parse(uri)
    if (parsed.scheme == null || parsed.scheme == "file") {
      extractor.setDataSource(parsed.path ?: uri)
      return null
    }
    // `content://` (the local library's SAF tree). Open the fd explicitly rather
    // than using the Context overload, which leaks it when track selection
    // throws on some OEM builds.
    val resolver = context?.contentResolver
      ?: throw WaveformSourceException("no React context available for $uri")
    val fd = try {
      resolver.openFileDescriptor(parsed, "r")
    } catch (e: Exception) {
      throw WaveformSourceException("cannot open $uri: ${e.message}")
    } ?: throw WaveformSourceException("cannot open $uri")
    try {
      extractor.setDataSource(fd.fileDescriptor)
    } catch (e: Exception) {
      runCatching { fd.close() }
      throw WaveformSourceException("cannot read $uri: ${e.message}")
    }
    return fd
  }

  private fun selectAudioTrack(extractor: MediaExtractor): Int {
    for (i in 0 until extractor.trackCount) {
      val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME)
      if (mime?.startsWith("audio/") == true) return i
    }
    throw WaveformUnsupportedException("no audio track")
  }

  /**
   * Prefer a software decoder. Hardware audio decoders are a limited per-device
   * pool and ExoPlayer already holds one for playback, so grabbing a second
   * throws on plenty of mid-range devices. Software audio decode still runs at
   * tens of times realtime, and its PCM output is predictable.
   */
  private fun createDecoder(mime: String): MediaCodec {
    val name = runCatching {
      MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.firstOrNull { info ->
        !info.isEncoder &&
          info.supportedTypes.any { it.equals(mime, ignoreCase = true) } &&
          (
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && info.isSoftwareOnly) ||
              info.name.startsWith("c2.android.") ||
              info.name.startsWith("OMX.google.")
            )
      }?.name
    }.getOrNull()
    return try {
      if (name != null) MediaCodec.createByCodecName(name)
      else MediaCodec.createDecoderByType(mime)
    } catch (e: Exception) {
      throw WaveformUnsupportedException("no decoder for $mime: ${e.message}")
    }
  }

  private fun decode(
    extractor: MediaExtractor,
    format: MediaFormat,
    buckets: Int,
    maxDurationMs: Long,
  ): PeakResult {
    val mime = format.getString(MediaFormat.KEY_MIME)
      ?: throw WaveformUnsupportedException("track has no mime type")
    val declaredRate =
      if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE))
        format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      else 44_100
    val declaredDurationUs =
      if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION)
      else 0L
    // Refuse before configuring a codec: a long file otherwise decodes until the
    // wall-clock deadline for a waveform that would be unreadable anyway. A
    // container with no duration falls through, which is what the deadline is
    // still there for.
    if (maxDurationMs > 0L && declaredDurationUs / 1_000L > maxDurationMs) {
      throw WaveformUnsupportedException(
        "track is ${declaredDurationUs / 1_000_000L}s, over the ${maxDurationMs / 1_000L}s analysis limit",
      )
    }
    // Only a seed for the accumulator's initial resolution — a wrong value costs
    // an extra fold, never correctness.
    val estimatedFrames = declaredDurationUs / 1_000_000.0 * declaredRate

    // Most decoders honour this and it collapses the output branching; the
    // per-buffer read below still handles a decoder that ignores it.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
    }

    val codec = createDecoder(mime)
    val accumulator = FoldingAccumulator(estimatedFrames.toLong())
    var outputRate = declaredRate
    try {
      codec.configure(format, null, null, 0)
      codec.start()

      val info = MediaCodec.BufferInfo()
      var sawInputEOS = false
      var sawOutputEOS = false
      val deadline = SystemClock.elapsedRealtime() + HARD_DEADLINE_MS

      while (!sawOutputEOS) {
        if (SystemClock.elapsedRealtime() > deadline) {
          throw WaveformTimeoutException("decode exceeded ${HARD_DEADLINE_MS}ms")
        }

        if (!sawInputEOS) {
          val inIndex = codec.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
          if (inIndex >= 0) {
            val buffer = codec.getInputBuffer(inIndex)
            val size = if (buffer != null) extractor.readSampleData(buffer, 0) else -1
            if (size < 0) {
              codec.queueInputBuffer(
                inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM,
              )
              sawInputEOS = true
            } else {
              codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }

        val outIndex = codec.dequeueOutputBuffer(info, DEQUEUE_TIMEOUT_US)
        if (outIndex >= 0) {
          // Codec-config buffers carry decoder setup bytes, not audio; feeding
          // them to the accumulator puts a fake spike at bucket 0.
          val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
          if (!isConfig && info.size > 0) {
            val outFormat = codec.getOutputFormat(outIndex)
            outputRate = if (outFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE))
              outFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            else outputRate
            val channels = if (outFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT))
              outFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            else 1
            val encoding = if (outFormat.containsKey(MediaFormat.KEY_PCM_ENCODING))
              outFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
            else AudioFormat.ENCODING_PCM_16BIT
            val buffer = codec.getOutputBuffer(outIndex)
            if (buffer != null) {
              accumulate(buffer, info, channels, encoding, accumulator)
            }
          }
          codec.releaseOutputBuffer(outIndex, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) sawOutputEOS = true
        }
        // INFO_TRY_AGAIN_LATER / INFO_OUTPUT_FORMAT_CHANGED /
        // INFO_OUTPUT_BUFFERS_CHANGED (deprecated but still returned on older
        // devices) all just mean "loop again" — the format is read per buffer.
      }
    } catch (e: CodecFailure) {
      throw e
    } catch (e: Exception) {
      throw WaveformDecodeException("${e.javaClass.simpleName}: ${e.message}")
    } finally {
      runCatching { codec.stop() }
      runCatching { codec.release() }
    }

    // The decoder's own frame count is exact, unlike a VBR container's header.
    val durationMs =
      if (outputRate > 0) accumulator.frames() * 1000L / outputRate
      else declaredDurationUs / 1000L
    return PeakResult(accumulator.toPeaks(buckets), durationMs)
  }

  private fun accumulate(
    buffer: ByteBuffer,
    info: MediaCodec.BufferInfo,
    channels: Int,
    encoding: Int,
    accumulator: FoldingAccumulator,
  ) {
    // ByteBuffer defaults to big-endian while PCM output is native-endian;
    // getting this wrong yields plausible-looking garbage rather than an error.
    buffer.order(ByteOrder.nativeOrder())
    buffer.position(info.offset)
    buffer.limit(info.offset + info.size)

    val ch = if (channels > 0) channels else 1
    when (encoding) {
      AudioFormat.ENCODING_PCM_16BIT -> {
        val shorts = buffer.asShortBuffer()
        val frames = shorts.remaining() / ch
        for (f in 0 until frames) {
          var sum = 0.0
          for (c in 0 until ch) sum += shorts.get(f * ch + c) / 32768.0
          accumulator.push(sum / ch)
        }
      }
      AudioFormat.ENCODING_PCM_FLOAT -> {
        // Android's FLAC decoder emits float for sources deeper than 16-bit.
        val floats = buffer.asFloatBuffer()
        val frames = floats.remaining() / ch
        for (f in 0 until frames) {
          var sum = 0.0
          for (c in 0 until ch) sum += floats.get(f * ch + c).toDouble()
          accumulator.push(sum / ch)
        }
      }
      AudioFormat.ENCODING_PCM_8BIT -> {
        val frames = buffer.remaining() / ch
        for (f in 0 until frames) {
          var sum = 0.0
          for (c in 0 until ch) sum += (buffer.get().toInt() - 128) / 128.0
          accumulator.push(sum / ch)
        }
      }
      else -> throw WaveformUnsupportedException("unsupported PCM encoding $encoding")
    }
  }
}
