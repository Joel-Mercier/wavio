package expo.modules.wearbridge

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONObject

/**
 * Phone half of the Wear OS remote control.
 *
 * Deliberately dumb: JS owns the protocol (services/wear/protocol.ts) and hands
 * this module ready-made JSON strings; incoming watch commands go back to JS as
 * raw JSON. The one thing native decides for itself is whether a cover has to
 * be re-encoded, because that is a bitmap operation JS shouldn't be doing.
 *
 * State and queue go out over DataClient, which Play Services retains and
 * replicates: a watch that wakes, reconnects after a Bluetooth drop, or
 * cold-starts reads the current values locally with no handshake and without
 * waking the phone. Only progress corrections (down) and commands (up) use the
 * fire-and-forget MessageClient.
 */
class WearBridgeModule : Module() {
  /**
   * Every DataClient write goes through this one thread, so they land in the
   * order JS issued them. That matters for `clearState`, which has to be able to
   * finish deleting before whatever the app publishes next — otherwise a
   * server switch can delete the *incoming* server's freshly published items.
   */
  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  /**
   * Node ids of reachable watches running Wavio. Cached rather than queried per
   * send: progress ticks at 2Hz and a Play Services round-trip per tick would
   * undo the point of the throttle. Refreshed whenever capabilities change.
   */
  @Volatile
  private var watchNodes: List<String> = emptyList()

  /**
   * artworkKey of the cover currently published, so it is encoded once. The
   * empty string is a real value here — it is what a track with no cover at all
   * publishes, and it has to be distinguishable from "nothing published yet"
   * (null) or a coverless track would suppress the next put.
   */
  @Volatile
  private var publishedArtworkKey: String? = null

  override fun definition() = ModuleDefinition {
    Name("WearBridge")

    Events("command", "connection")

    OnCreate {
      instance = this@WearBridgeModule
      refreshWatchNodes(null)
    }

    OnDestroy {
      if (instance === this@WearBridgeModule) instance = null
      io.shutdown()
    }

    Function("putState") { json: String ->
      putData(WearPaths.STATE, json, urgent = true)
    }

    Function("putQueue") { json: String ->
      putData(WearPaths.QUEUE, json, urgent = false)
    }

    Function("putArtwork") { json: String ->
      val o = runCatching { JSONObject(json) }.getOrNull() ?: return@Function
      // Empty key = the current track has no cover. Still published, as an item
      // carrying no asset, so the watch is told to drop the one it holds.
      val key = o.stringOrNull(WearPaths.KEY_ARTWORK_KEY) ?: ""
      val fileUri = o.stringOrNull("fileUri")
      if (key == publishedArtworkKey) return@Function
      val context = appContext.reactContext ?: return@Function
      // Decoding blocks; keep it off the JS thread.
      io.execute { publishArtwork(context, key, fileUri) }
    }

    Function("sendProgress") { json: String ->
      sendMessage(WearPaths.PROGRESS, json)
    }

    Function("clearState") {
      appContext.reactContext?.let { context ->
        publishedArtworkKey = null
        io.execute {
          val client = Wearable.getDataClient(context)
          for (path in listOf(WearPaths.STATE, WearPaths.QUEUE, WearPaths.ARTWORK)) {
            // Awaited, on the same thread the puts use: a delete still in flight
            // when the next server publishes would wipe its state instead.
            runCatching { awaitDataOp(client.deleteDataItems(Uri.parse("wear://*$path"))) }
              .onFailure { WearLog.w("deleteDataItems($path) failed", it) }
          }
        }
      }
    }

    AsyncFunction("getConnectedNodes") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(emptyList<String>())
        return@AsyncFunction
      }
      refreshWatchNodes(promise)
    }
  }

  // === outbound ===

  /**
   * `optString` answers the *string* "null" for a JSON null, which would sail
   * through an isNotEmpty() check and be treated as a real value.
   */
  private fun JSONObject.stringOrNull(name: String): String? =
    if (isNull(name)) null else optString(name).takeIf { it.isNotEmpty() }

  private fun putData(path: String, json: String, urgent: Boolean) {
    val context = appContext.reactContext ?: return
    io.execute {
      runCatching {
        val request = PutDataMapRequest.create(path).apply {
          dataMap.putString(WearPaths.KEY_JSON, json)
        }.asPutDataRequest().let { if (urgent) it.setUrgent() else it }
        awaitDataOp(Wearable.getDataClient(context).putDataItem(request))
      }.onFailure { WearLog.w("putData($path) failed", it) }
    }
  }

  /**
   * Waits for a DataClient operation to land. Called only from [io], whose whole
   * purpose is ordering: a put that returned but hasn't been applied yet would
   * let a later delete overtake it, and vice versa.
   */
  private fun <T> awaitDataOp(task: Task<T>): T? =
    Tasks.await(task, DATA_OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)

  private fun publishArtwork(context: Context, key: String, fileUri: String?) {
    val bytes = fileUri?.let { WearArtwork.encode(it) }
    runCatching {
      val request = PutDataMapRequest.create(WearPaths.ARTWORK).apply {
        dataMap.putString(WearPaths.KEY_ARTWORK_KEY, key)
        if (bytes != null) {
          dataMap.putAsset(WearPaths.ASSET_ARTWORK, Asset.createFromBytes(bytes))
        }
      }.asPutDataRequest()
      awaitDataOp(Wearable.getDataClient(context).putDataItem(request))
      // Only mark it published once it landed; a failed put must be retried on
      // the next track, not skipped as already-current.
      publishedArtworkKey = key
      WearLog.d("artwork published key=$key bytes=${bytes?.size ?: 0}")
    }.onFailure { WearLog.w("artwork put failed", it) }
  }

  private fun sendMessage(path: String, json: String) {
    val context = appContext.reactContext ?: return
    val nodes = watchNodes
    if (nodes.isEmpty()) return
    val payload = json.toByteArray(Charsets.UTF_8)
    val client = Wearable.getMessageClient(context)
    for (node in nodes) {
      runCatching { client.sendMessage(node, path, payload) }
        .onFailure { WearLog.w("sendMessage($path) threw", it) }
    }
  }

  private fun refreshWatchNodes(promise: Promise?) {
    val context = appContext.reactContext
    if (context == null) {
      promise?.resolve(emptyList<String>())
      return
    }
    runCatching {
      Wearable.getCapabilityClient(context)
        .getCapability(WearPaths.CAPABILITY_WATCH, CapabilityClient.FILTER_REACHABLE)
        .addOnSuccessListener { info ->
          val ids = info.nodes.map { it.id }
          watchNodes = ids
          promise?.resolve(ids)
        }
        .addOnFailureListener {
          WearLog.w("getCapability failed", it)
          promise?.resolve(emptyList<String>())
        }
    }.onFailure {
      WearLog.w("refreshWatchNodes threw", it)
      promise?.resolve(emptyList<String>())
    }
  }

  // === inbound, called from WavioWearListenerService ===

  fun emitCommand(json: String) {
    main.post { runCatching { sendEvent("command", mapOf("json" to json)) } }
  }

  fun onWatchNodesChanged(nodeIds: List<String>) {
    watchNodes = nodeIds
    // A watch that just became reachable may have missed everything published
    // while it was away, and a reinstalled watch has an empty cache. Force the
    // next artwork put to actually run.
    if (nodeIds.isNotEmpty()) publishedArtworkKey = null
    main.post {
      runCatching { sendEvent("connection", mapOf("connected" to nodeIds.isNotEmpty())) }
    }
  }

  companion object {
    /** Play Services is local; anything slower than this is a wedged service. */
    private const val DATA_OP_TIMEOUT_SECONDS = 5L

    @Volatile
    var instance: WearBridgeModule? = null
      private set
  }
}
