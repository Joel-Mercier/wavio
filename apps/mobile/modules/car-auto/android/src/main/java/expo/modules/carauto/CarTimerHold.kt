package expo.modules.carauto

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Choreographer
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import java.lang.ref.WeakReference

/**
 * Keeps JS timers running for as long as a car is connected.
 *
 * React Native's `JavaTimerManager` pauses every timer unless an Activity is
 * resumed or a headless JS task is active. In the car the phone UI is normally
 * in the background, or was never opened at all, so every `setTimeout` /
 * `setInterval` in the car session froze: the browse-tree build stalled at its
 * first yield, the position pulse stopped and fetch deadlines never fired
 * (issue #205). Holding a headless task for the length of the car session is
 * the supported way to keep them running.
 *
 * Necessary but not sufficient: the timer manager still fires from
 * Choreographer frame callbacks, and MIUI (verified) delivers none to an idle
 * background app, held task or not. The car session's own waits therefore go
 * through `CarAutoBridge.delay` (a Handler message); this hold keeps every
 * other timer — playback, scrobbling, fetch deadlines — alive wherever frames
 * do arrive.
 *
 * JS registers [TASK_KEY] (services/carAuto/session.ts) as a task that settles
 * when the car disconnects; this side starts it and finishes it. State is only
 * touched on the main thread, which `startTask` requires anyway.
 */
object CarTimerHold {
  const val TASK_KEY = "WavioCarSession"

  private val main = Handler(Looper.getMainLooper())
  private var heldContext: WeakReference<ReactContext>? = null
  private var heldTaskId = 0

  /**
   * Hold or release to match [wanted], evaluated on the main thread. The inputs
   * change on different threads (a binder thread for the car, the JS thread for
   * readiness), so deciding at call time could let a stale release land after a
   * newer acquire; deciding here means the last update always sees final state.
   */
  fun update(wanted: () -> Context?) {
    main.post {
      val context = wanted()
      if (context == null) finishHeld() else acquire(context)
    }
  }

  // Trace-only: whether the task survived its start (JS settles it on
  // disconnect, so an early finish means JS thought no car was connected) and
  // whether frames still arrive, since the timer manager fires timers from
  // Choreographer frame callbacks and a held task is useless without them.
  private fun traceHold(react: ReactContext, id: Int) {
    if (!CarAutoLog.enabled) return
    main.postDelayed({
      val running = HeadlessJsTaskContext.getInstance(react).isTaskRunning(id)
      val postedAt = SystemClock.uptimeMillis()
      CarAutoLog.d("timer hold task $id running=$running after 3s")
      Choreographer.getInstance().postFrameCallback {
        CarAutoLog.d("frame callback delivered after ${SystemClock.uptimeMillis() - postedAt}ms")
      }
    }, 3_000L)
  }

  private fun acquire(context: Context) {
    // The timer manager listens on the host's own context, so the task has to
    // be started on that one — not on whichever context a module holds.
    val react = (context.applicationContext as? ReactApplication)
      ?.reactHost
      ?.currentReactContext
    if (react == null) {
      CarAutoLog.w("cannot hold JS timers: no current react context")
      return
    }
    if (heldContext?.get() === react) return
    finishHeld()
    runCatching {
      HeadlessJsTaskContext.getInstance(react).startTask(
        HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), 0, true),
      )
    }
      .onSuccess { id ->
        heldContext = WeakReference(react)
        heldTaskId = id
        CarAutoLog.d("holding JS timers (task $id)")
        traceHold(react, id)
      }
      .onFailure { CarAutoLog.w("could not hold JS timers", it) }
  }

  private fun finishHeld() {
    val react = heldContext?.get()
    heldContext = null
    if (react == null) return
    HeadlessJsTaskContext.getInstance(react).finishTask(heldTaskId)
    CarAutoLog.d("released JS timers (task $heldTaskId)")
  }
}
