package expo.modules.castserver

import android.content.Context
import android.net.wifi.WifiManager
import android.os.PowerManager

/**
 * Keeps the phone able to serve while a receiver plays from it.
 *
 * Nothing plays on the phone during a cast, so nothing else holds it awake, and with
 * the screen off on battery it sleeps (issue #295): a receiver asking for the next
 * range, or the next track, would then wait on a phone that isn't running. The
 * Wi-Fi lock keeps the radio out of power save, which a receiver notices as
 * rebuffering on a high-bitrate file. UPnP's own `KeepAwake` keeps the polls going;
 * this one is about the bytes.
 *
 * Held for as long as JS says playback is under way, plus a short lease after every
 * request and after playback stops, so a response in flight can finish. Every hold
 * has a timeout: a session nobody ends cannot keep the phone awake for good.
 */
internal class ServingLocks(context: Context) {
  private val wakeLock = (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Wavio:cast-server")
    .apply { setReferenceCounted(false) }

  // WIFI_MODE_FULL_HIGH_PERF has no effect from Android 14, and the low-latency mode
  // only applies while the app is in the foreground — the opposite of when this is
  // needed. It still helps on the versions where it works, and costs nothing where it
  // doesn't.
  @Suppress("DEPRECATION")
  private val wifiLock = (context.getSystemService(Context.WIFI_SERVICE) as? WifiManager)
    ?.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Wavio:cast-server")
    ?.apply { setReferenceCounted(false) }

  private var active = false

  // A request still in flight when the session ends must not take the lock back.
  private var engaged = false

  @Synchronized
  fun setActive(playing: Boolean) {
    engaged = true
    active = playing
    if (playing) {
      wakeLock.acquire(PLAYING_MS)
      runCatching { wifiLock?.acquire() }
    } else {
      wakeLock.acquire(LEASE_MS)
      runCatching { if (wifiLock?.isHeld == true) wifiLock.release() }
    }
  }

  @Synchronized
  fun touch() {
    if (!engaged) return
    wakeLock.acquire(if (active) PLAYING_MS else LEASE_MS)
  }

  @Synchronized
  fun release() {
    engaged = false
    active = false
    if (wakeLock.isHeld) wakeLock.release()
    runCatching { if (wifiLock?.isHeld == true) wifiLock.release() }
  }

  private companion object {
    /** Comfortably longer than the gap between a track ending and the next request. */
    const val LEASE_MS = 30_000L

    /** A cap, not an expectation: every state change renews it. */
    const val PLAYING_MS = 4 * 60 * 60 * 1000L
  }
}
