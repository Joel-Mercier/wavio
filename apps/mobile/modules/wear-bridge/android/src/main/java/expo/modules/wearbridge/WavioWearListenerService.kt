package expo.modules.wearbridge

import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/**
 * Receives watch → phone traffic and hands it to JS.
 *
 * Commands are dropped by design when there is no JS runtime at all (app swiped
 * away with nothing playing): the watch still renders its retained copy of the
 * last state and tells the user to open Wavio on the phone. Waking the app from
 * a watch tap would need what Android Auto does — see ReactHostBoot in
 * modules/car-auto — and is deliberately not done here.
 *
 * A live runtime is enough on its own, with or without an Activity: the JS half
 * (services/wear/session.ts) is started from index.js and lives as long as the
 * process, so a headless Android Auto boot and a swiped-away app that is still
 * playing both keep answering.
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
