package expo.modules.audiowaveform

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class AudioWaveformModule : Module() {
  // `AsyncFunction` runs on a dispatcher shared by every Expo module in the app,
  // so a multi-second decode there would stall unrelated native calls (the
  // library indexer's metadata reads, for one). Own the thread instead — which
  // also serializes decodes, keeping a single decoder instance alive at a time.
  private val executor = Executors.newSingleThreadExecutor { r ->
    Thread(r, "wavio-waveform").apply { isDaemon = true }
  }

  override fun definition() = ModuleDefinition {
    Name("AudioWaveform")

    AsyncFunction("extractPeaks") { uri: String, buckets: Int, maxDurationMs: Long, promise: Promise ->
      executor.execute {
        try {
          val result =
            PeakExtractor.extract(appContext.reactContext, uri, buckets, maxDurationMs)
          promise.resolve(
            mapOf(
              "peaks" to result.peaks.toList(),
              "durationMs" to result.durationMs,
            ),
          )
        } catch (e: CodecFailure) {
          promise.reject(e)
        } catch (e: Exception) {
          promise.reject(WaveformDecodeException("${e.javaClass.simpleName}: ${e.message}"))
        }
      }
    }

    OnDestroy {
      executor.shutdownNow()
    }
  }
}
