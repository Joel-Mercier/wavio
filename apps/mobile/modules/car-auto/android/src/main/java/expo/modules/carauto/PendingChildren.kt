package expo.modules.carauto

import android.os.Handler
import android.os.Looper
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture

/**
 * Browses the tree JS pushed can't answer yet: an album the build lists without
 * prefetching its tracks (issue #205). The host's `onGetChildren` waits on JS
 * fetching it rather than rendering an empty album.
 *
 * Main thread only, like the session callbacks that call it.
 */
internal object PendingChildren {
  // JS answers within a request's round trip, or once the runtime has booted on
  // a cold bind. Past this the host gets an empty page; JS answering later still
  // lands through notifyChildrenChanged.
  private const val TIMEOUT_MS = 8_000L

  private val mainHandler = Handler(Looper.getMainLooper())
  private val waiting = HashMap<String, SettableFuture<Unit>>()

  // Parents JS resolves on demand. Anything else missing from the tree is
  // genuinely empty, or waiting on the first push, which notifies by itself.
  private val ON_DEMAND_PREFIXES = listOf("album:")

  fun isOnDemand(parentId: String): Boolean =
    ON_DEMAND_PREFIXES.any { parentId.startsWith(it) } && !BrowseTreeCache.hasParent(parentId)

  fun await(parentId: String): ListenableFuture<Unit> {
    waiting[parentId]?.let { return it }
    val future = SettableFuture.create<Unit>()
    waiting[parentId] = future
    mainHandler.postDelayed({
      if (waiting[parentId] === future) {
        CarAutoLog.d("children timed out for $parentId")
        release(parentId)
      }
    }, TIMEOUT_MS)
    CarAutoModule.deliverChildrenRequest(parentId)
    return future
  }

  // Returns whether a browse was still waiting on this parent.
  fun release(parentId: String): Boolean {
    val future = waiting.remove(parentId) ?: return false
    future.set(Unit)
    return true
  }
}
