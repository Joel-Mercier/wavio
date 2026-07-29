package com.jmercier.wavio.wear.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Everything the watch knows about the phone.
 *
 * State and queue arrive as *retained* DataItems, which is what makes recovery
 * free: Play Services keeps the last value on the watch, so waking, a Bluetooth
 * drop and reconnect, a phone reboot, or a cold start all resolve with one
 * local read in [refresh] — no handshake, no polling, no phone wakeup. Live
 * progress corrections arrive separately as messages and are only sent while
 * the screen is on.
 */
class PhoneRepository(private val context: Context) :
  DataClient.OnDataChangedListener,
  MessageClient.OnMessageReceivedListener,
  CapabilityClient.OnCapabilityChangedListener {

  private val _state = MutableStateFlow(PlayerState())
  val state: StateFlow<PlayerState> = _state.asStateFlow()

  private val _queue = MutableStateFlow(QueueState())
  val queue: StateFlow<QueueState> = _queue.asStateFlow()

  private val _artwork = MutableStateFlow<Bitmap?>(null)
  val artwork: StateFlow<Bitmap?> = _artwork.asStateFlow()

  /** Whether a phone running Wavio is currently reachable. */
  private val _phoneReachable = MutableStateFlow(true)
  val phoneReachable: StateFlow<Boolean> = _phoneReachable.asStateFlow()

  /** Cover identity most recently accepted, so a decode race can't go backwards. */
  @Volatile
  private var loadedArtworkKey: String? = null

  private val artworkScope = CoroutineScope(Dispatchers.Main.immediate)

  private val dataClient get() = Wearable.getDataClient(context)
  private val messageClient get() = Wearable.getMessageClient(context)
  private val capabilityClient get() = Wearable.getCapabilityClient(context)

  fun start(scope: CoroutineScope) {
    dataClient.addListener(this)
    messageClient.addListener(this)
    capabilityClient.addListener(this, Protocol.CAPABILITY_PHONE)
    scope.launch { refresh() }
  }

  /** Fed by CommandSender: a command the phone never took means it isn't there. */
  fun setReachable(reachable: Boolean) {
    _phoneReachable.value = reachable
  }

  fun stop() {
    dataClient.removeListener(this)
    messageClient.removeListener(this)
    capabilityClient.removeListener(this, Protocol.CAPABILITY_PHONE)
  }

  /** Read whatever the phone last published. Safe to call at any time. */
  suspend fun refresh() {
    withContext(Dispatchers.IO) {
      runCatching {
        val nodes = capabilityClient
          .getCapability(Protocol.CAPABILITY_PHONE, CapabilityClient.FILTER_REACHABLE)
          .await()
        _phoneReachable.value = nodes.nodes.isNotEmpty()
      }.onFailure { Log.w(TAG, "capability query failed", it) }

      runCatching {
        val buffer = dataClient.dataItems.await()
        try {
          for (item in buffer) apply(item)
        } finally {
          buffer.release()
        }
      }.onFailure { Log.w(TAG, "retained read failed", it) }
    }
  }

  override fun onDataChanged(events: DataEventBuffer) {
    // The buffer is only valid for the duration of this callback, so anything
    // asynchronous (artwork decoding) must copy what it needs first.
    val changed = mutableListOf<DataItem>()
    val deleted = mutableListOf<String>()
    for (event in events) {
      when (event.type) {
        DataEvent.TYPE_CHANGED -> changed += event.dataItem.freeze()
        DataEvent.TYPE_DELETED -> event.dataItem.uri.path?.let { deleted += it }
      }
    }
    events.release()
    // Deletions first, so a clear-and-republish arriving in one buffer still
    // ends on the new value.
    for (path in deleted) clear(path)
    for (item in changed) apply(item)
  }

  /**
   * The phone dropped an item — it does that when the signed-in server changes,
   * and the previous server's title, queue and cover have to go with it. Without
   * this the flows keep serving them, with nothing left to correct them.
   */
  private fun clear(path: String) {
    when (path) {
      Protocol.PATH_STATE -> _state.value = PlayerState()
      Protocol.PATH_QUEUE -> _queue.value = QueueState()
      Protocol.PATH_ARTWORK -> {
        loadedArtworkKey = null
        _artwork.value = null
      }
    }
  }

  override fun onMessageReceived(event: MessageEvent) {
    if (event.path != Protocol.PATH_PROGRESS) return
    val json = runCatching { String(event.data, Charsets.UTF_8) }.getOrNull() ?: return
    val o = runCatching { JSONObject(json) }.getOrNull() ?: return
    val current = _state.value
    val isPlaying = o.optBoolean("isPlaying", current.isPlaying)
    val (position, base) = rebase(
      positionMs = o.optLong("positionMs", current.positionMs),
      sentAtEpochMs = o.optLong("sentAtEpochMs", 0L),
      isPlaying = isPlaying,
      durationMs = current.track?.durationMs ?: 0L,
      nowEpochMs = System.currentTimeMillis(),
      nowElapsedRealtime = SystemClock.elapsedRealtime(),
    )
    _phoneReachable.value = true
    _state.value = current.copy(
      known = true,
      isPlaying = isPlaying,
      positionMs = position,
      baseElapsedRealtime = base,
    )
  }

  override fun onCapabilityChanged(info: CapabilityInfo) {
    if (info.name != Protocol.CAPABILITY_PHONE) return
    _phoneReachable.value = info.nodes.isNotEmpty()
  }

  private fun apply(item: DataItem) {
    when (item.uri.path) {
      Protocol.PATH_STATE -> {
        val json = jsonOf(item) ?: return
        parseState(json, System.currentTimeMillis(), SystemClock.elapsedRealtime())
          ?.let { parsed ->
            // Artwork lands as its own item and may arrive either side of this
            // one; clear the stale bitmap the moment the cover identity moves.
            if (parsed.artworkKey != loadedArtworkKey) _artwork.value = null
            _state.value = parsed
          }
      }

      Protocol.PATH_QUEUE -> {
        val json = jsonOf(item) ?: return
        parseQueue(json)?.let { _queue.value = it }
      }

      Protocol.PATH_ARTWORK -> applyArtwork(item)
    }
  }

  private fun applyArtwork(item: DataItem) {
    val map = runCatching { DataMapItem.fromDataItem(item).dataMap }.getOrNull() ?: return
    val key = map.getString(Protocol.KEY_ARTWORK_KEY) ?: return
    if (key == loadedArtworkKey && _artwork.value != null) return
    // Claimed before the decode so a cover that arrives while this one is still
    // being read wins, rather than being overwritten by the slower decode.
    loadedArtworkKey = key
    val asset = map.getAsset(Protocol.ASSET_ARTWORK)
    if (asset == null) {
      _artwork.value = null
      return
    }
    artworkScope.launch {
      val bitmap = withContext(Dispatchers.IO) {
        runCatching {
          dataClient.getFdForAsset(asset).await().inputStream.use {
            BitmapFactory.decodeStream(it)
          }
        }.getOrNull()
      }
      if (loadedArtworkKey == key) _artwork.value = bitmap
    }
  }

  private fun jsonOf(item: DataItem): String? = runCatching {
    DataMapItem.fromDataItem(item).dataMap.getString(Protocol.KEY_JSON)
  }.getOrNull()

  private companion object {
    const val TAG = "WavioWear"
  }
}
