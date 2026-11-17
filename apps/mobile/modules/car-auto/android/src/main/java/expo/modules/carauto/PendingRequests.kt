package expo.modules.carauto

import android.os.Handler
import android.os.Looper
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import java.util.concurrent.atomic.AtomicInteger

/**
 * Host requests only JS can answer: children of a parent that was never
 * pushed, search results, and list-item actions. Each waits for JS up to a
 * deadline; past it the host gets an empty answer, and a late JS answer still
 * lands through notifyChildrenChanged / notifySearchResultChanged.
 *
 * Futures are completed on the main thread, where media3 runs its callbacks.
 */
internal object PendingRequests {
  private const val CHILDREN_TIMEOUT_MS = 8_000L
  private const val SEARCH_TIMEOUT_MS = 10_000L
  private const val ACTION_TIMEOUT_MS = 10_000L

  private val mainHandler = Handler(Looper.getMainLooper())
  private val children = HashMap<String, SettableFuture<Unit>>()
  private val searches = HashMap<String, SettableFuture<Unit>>()
  private val actions = HashMap<Int, SettableFuture<String?>>()
  private val nextActionId = AtomicInteger(1)

  fun awaitChildren(parentId: String): ListenableFuture<Unit> {
    val future = synchronized(this) {
      children[parentId]?.let { return it }
      SettableFuture.create<Unit>().also { children[parentId] = it }
    }
    mainHandler.postDelayed({ releaseChildren(parentId, future) }, CHILDREN_TIMEOUT_MS)
    CarAutoModule.deliverChildrenRequest(parentId)
    return future
  }

  fun releaseChildren(parentId: String, only: SettableFuture<Unit>? = null) {
    val future = synchronized(this) {
      val current = children[parentId] ?: return
      if (only != null && current !== only) return
      children.remove(parentId)
    } ?: return
    future.set(Unit)
  }

  fun awaitSearch(query: String): ListenableFuture<Unit> {
    val future = synchronized(this) {
      searches[query]?.let { return it }
      SettableFuture.create<Unit>().also { searches[query] = it }
    }
    mainHandler.postDelayed({ releaseSearch(query, future) }, SEARCH_TIMEOUT_MS)
    CarAutoModule.deliverSearchRequest(query)
    return future
  }

  fun releaseSearch(query: String, only: SettableFuture<Unit>? = null) {
    val future = synchronized(this) {
      val current = searches[query] ?: return
      if (only != null && current !== only) return
      searches.remove(query)
    } ?: return
    future.set(Unit)
  }

  fun hasPendingSearch(query: String): Boolean = synchronized(this) { query in searches }

  fun awaitAction(action: String, mediaId: String): ListenableFuture<String?> {
    val id = nextActionId.getAndIncrement()
    val future = SettableFuture.create<String?>()
    synchronized(this) { actions[id] = future }
    if (!CarAutoModule.deliverItemAction(id, action, mediaId)) {
      answerAction(id, null)
      return future
    }
    mainHandler.postDelayed({ answerAction(id, null) }, ACTION_TIMEOUT_MS)
    return future
  }

  fun answerAction(requestId: Int, json: String?) {
    val future = synchronized(this) { actions.remove(requestId) } ?: return
    future.set(json)
  }
}
