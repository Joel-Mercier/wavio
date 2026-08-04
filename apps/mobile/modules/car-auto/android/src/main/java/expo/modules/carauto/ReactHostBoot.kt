package expo.modules.carauto

import android.content.Context
import android.os.Handler
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.interfaces.TaskInterface
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Boots the React Native runtime from the media service.
 *
 * Android Auto binds `WavioCarBrowserService` directly, which starts the app
 * *process* but no Activity — and the React host is only started by
 * `ReactActivityDelegate`. Without this, a cold Android Auto session has no JS
 * at all: the browse tree still renders (it is restored from disk by
 * `BrowseTreeCache`), but every play/transport event is dropped because
 * `CarAutoModule.instance` is null.
 *
 * Same approach Expo uses for headless tasks (see `RNHeadlessAppLoader` in
 * expo-modules-core): `start()` must be posted to the main thread, and the
 * context arrives asynchronously via a `ReactInstanceEventListener`.
 *
 * The host is deliberately never destroyed here — the JS runtime owns playback,
 * so tearing it down when Android Auto disconnects would kill the music.
 */
object ReactHostBoot {
  // Car intents arrive on binder threads, so the "already starting?" check and
  // the flag it sets have to be one atomic step — two concurrent taps would
  // otherwise both start the host.
  private val starting = AtomicBoolean(false)

  // A boot that never produces a context (bundle load failure, a crash while
  // evaluating) must not wedge the flag for the rest of the process: every later
  // tap would no-op, leaving the car dead until it is force-stopped.
  private const val BOOT_TIMEOUT_MS = 60_000L

  fun ensureJsRuntime(context: Context) {
    val app = context.applicationContext as? ReactApplication
    if (app == null) {
      CarAutoLog.w("application is not a ReactApplication; cannot start JS")
      return
    }
    val host = app.reactHost
    if (host == null) {
      CarAutoLog.w("no reactHost; cannot start JS")
      return
    }
    if (host.currentReactContext != null) return
    if (!starting.compareAndSet(false, true)) return
    val handler = Handler(context.mainLooper)
    val listener = object : ReactInstanceEventListener {
      override fun onReactContextInitialized(context: ReactContext) {
        host.removeReactInstanceEventListener(this)
        starting.set(false)
        CarAutoLog.d("react context initialized headlessly")
      }
    }
    host.addReactInstanceEventListener(listener)
    // The context can arrive between the check above and this registration, in
    // which case the listener never fires — release the flag ourselves.
    if (host.currentReactContext != null) {
      host.removeReactInstanceEventListener(listener)
      starting.set(false)
      return
    }
    CarAutoLog.d("starting react host from car service")
    handler.post {
      val task = runCatching { host.start() }.getOrElse {
        host.removeReactInstanceEventListener(listener)
        starting.set(false)
        CarAutoLog.w("reactHost.start() failed", it)
        return@post
      }
      watchBootTask(host, listener, handler, task)
    }
  }

  /**
   * `start()` reports a failed bundle load on its own task, ~1s later — it does
   * not throw — so a synchronous catch never sees it and the boot flag would
   * stay set until the timeout below, silently swallowing every tap in between.
   * Waiting on the task blocks, so it cannot happen on the main thread.
   */
  private fun watchBootTask(
    host: ReactHost,
    listener: ReactInstanceEventListener,
    handler: Handler,
    task: TaskInterface<Void>,
  ) {
    Thread({
      val completed = runCatching {
        task.waitForCompletion(BOOT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      }.getOrDefault(false)
      // A context means the listener owns the flag; it has cleared it already or
      // is about to.
      if (host.currentReactContext != null) return@Thread
      if (!starting.compareAndSet(true, false)) return@Thread
      handler.post { host.removeReactInstanceEventListener(listener) }
      if (completed) {
        CarAutoLog.w("react host start finished without a context", task.getError())
      } else {
        CarAutoLog.w("react host did not initialize within ${BOOT_TIMEOUT_MS}ms")
      }
    }, "carauto-boot-watch").start()
  }
}
