package com.jmercier.wavio.wear.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Watch → phone commands, over the fire-and-forget MessageClient.
 *
 * Nothing durable rides on these: the phone answers by republishing its state
 * as a retained DataItem, so a command that gets lost shows up as the UI simply
 * not changing, and the next one recovers. One retry covers the common case of
 * a node id that went stale while the connection dropped.
 */
class CommandSender(
  private val context: Context,
  /** Called with whether the phone accepted the command, to drive the UI banner. */
  private val onReachable: (Boolean) -> Unit,
) {
  /**
   * Deliberately not the activity's lifecycleScope. `unsubscribe` is sent from
   * onPause, and on a swipe-away that scope is already cancelling — the send
   * suspends into IO and never leaves, so the phone would go on pushing progress
   * at 2Hz with nothing listening. This one outlives the activity by the few
   * hundred milliseconds a delivery takes.
   */
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  @Volatile
  private var cachedNodes: List<String> = emptyList()

  fun play() = send(Protocol.command("play"))
  fun pause() = send(Protocol.command("pause"))
  fun next() = send(Protocol.command("next"))
  fun previous() = send(Protocol.command("previous"))
  fun seek(positionMs: Long) = send(Protocol.command("seek", positionMs))
  fun seekToIndex(index: Int) = send(Protocol.command("seekToIndex", index.toLong()))
  fun setShuffle(enabled: Boolean) = send(Protocol.command("shuffle", enabled))
  fun setRepeat(mode: String) = send(Protocol.command("repeat", mode))

  /** Tells the phone the player screen is visible, which starts progress ticks. */
  fun subscribe() = send(Protocol.command("subscribe"))

  fun unsubscribe() = send(Protocol.command("unsubscribe"))

  fun hello() = send(Protocol.hello())

  private fun send(json: String) {
    scope.launch {
      val delivered = deliver(json, useCache = true) || deliver(json, useCache = false)
      onReachable(delivered)
    }
  }

  private suspend fun deliver(json: String, useCache: Boolean): Boolean =
    withContext(Dispatchers.IO) {
      runCatching {
        val nodes = if (useCache && cachedNodes.isNotEmpty()) cachedNodes else resolveNodes()
        if (nodes.isEmpty()) return@runCatching false
        val payload = json.toByteArray(Charsets.UTF_8)
        val client = Wearable.getMessageClient(context)
        var any = false
        for (node in nodes) {
          runCatching { client.sendMessage(node, Protocol.PATH_COMMAND, payload).await() }
            .onSuccess { any = true }
            .onFailure { Log.w(TAG, "sendMessage to $node failed", it) }
        }
        if (!any) cachedNodes = emptyList()
        any
      }.getOrElse {
        Log.w(TAG, "deliver failed", it)
        cachedNodes = emptyList()
        false
      }
    }

  private suspend fun resolveNodes(): List<String> {
    val info = Wearable.getCapabilityClient(context)
      .getCapability(Protocol.CAPABILITY_PHONE, CapabilityClient.FILTER_REACHABLE)
      .await()
    return info.nodes.map { it.id }.also { cachedNodes = it }
  }

  private companion object {
    const val TAG = "WavioWear"
  }
}
