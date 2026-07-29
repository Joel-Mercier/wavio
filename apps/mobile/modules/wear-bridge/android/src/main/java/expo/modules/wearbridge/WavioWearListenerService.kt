package expo.modules.wearbridge

import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/**
 * Receives watch → phone traffic and hands it to JS.
 *
 * When the React instance is gone (app swiped away with nothing playing) there
 * is nothing to hand it to, and commands are dropped by design: the watch still
 * renders its retained copy of the last state and tells the user to open Wavio
 * on the phone. While audio is actually playing the process is alive behind a
 * foreground service, so this only affects the cold-start case.
 */
class WavioWearListenerService : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    if (event.path != WearPaths.COMMAND) return
    val json = runCatching { String(event.data, Charsets.UTF_8) }.getOrNull() ?: return
    val module = WearBridgeModule.instance
    if (module == null) {
      WearLog.d("command dropped, no JS instance: $json")
      return
    }
    module.emitCommand(json)
  }

  override fun onCapabilityChanged(info: CapabilityInfo) {
    if (info.name != WearPaths.CAPABILITY_WATCH) return
    val ids = info.nodes.map { it.id }
    WearLog.d("watch nodes changed: $ids")
    WearBridgeModule.instance?.onWatchNodesChanged(ids)
  }
}
