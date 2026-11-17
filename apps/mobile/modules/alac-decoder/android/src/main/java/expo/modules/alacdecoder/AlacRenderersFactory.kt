package expo.modules.alacdecoder

import android.content.Context
import android.os.Handler
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector

/**
 * The default renderers, with FFmpeg's ALAC decoder ranked ahead of MediaCodec.
 *
 * The bundled FFmpeg is built with the ALAC decoder only, so the renderer added
 * here claims ALAC and reports every other format unsupported: AAC, MP3, FLAC,
 * Opus and the rest still go to MediaCodec exactly as before. Ranking it first
 * matters because some vendors (Qualcomm's c2.qti.alac) advertise an ALAC codec
 * that fails at runtime. If the native library can't load, the renderer rejects
 * ALAC too and playback falls back to the platform's own behaviour.
 */
@UnstableApi
class AlacRenderersFactory(context: Context) : DefaultRenderersFactory(context) {
  override fun buildAudioRenderers(
    context: Context,
    extensionRendererMode: Int,
    mediaCodecSelector: MediaCodecSelector,
    enableDecoderFallback: Boolean,
    audioSink: AudioSink,
    eventHandler: Handler,
    eventListener: AudioRendererEventListener,
    out: ArrayList<Renderer>
  ) {
    out.add(FfmpegAudioRenderer(eventHandler, eventListener, audioSink))
    super.buildAudioRenderers(
      context,
      extensionRendererMode,
      mediaCodecSelector,
      enableDecoderFallback,
      audioSink,
      eventHandler,
      eventListener,
      out
    )
  }
}
