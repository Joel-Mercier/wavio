package expo.modules.upnpcast

import android.content.Context
import android.os.PowerManager

/**
 * Keeps the CPU running while a renderer plays. Nothing plays on the phone then, so
 * nothing else holds it awake, and once the screen is off and the phone is on battery
 * it sleeps: the polls stop, and the end of a track goes unnoticed until something
 * else happens to wake it (issue #295).
 *
 * Held as a lease that every sign of our track playing renews, so a paused or
 * finished renderer lets the phone sleep again without anyone having to say so, and
 * a poll loop that dies cannot leave it held.
 *
 * Renewal and release share a lock, so a renewal that checks [renew]'s condition
 * before a release is undone by it, and one that checks after sees it.
 */
class KeepAwake(context: Context) {
  private val wakeLock = (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Wavio:upnp-cast")
    .apply { setReferenceCounted(false) }

  @Synchronized
  fun renew(stillWanted: () -> Boolean = { true }) {
    if (stillWanted()) wakeLock.acquire(LEASE_MS)
  }

  @Synchronized
  fun release() {
    if (wakeLock.isHeld) wakeLock.release()
  }

  private companion object {
    /** Comfortably longer than the gap between a track ending and the next load. */
    const val LEASE_MS = 30_000L
  }
}
