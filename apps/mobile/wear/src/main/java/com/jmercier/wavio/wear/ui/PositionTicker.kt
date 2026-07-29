package com.jmercier.wavio.wear.ui

import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import com.jmercier.wavio.wear.data.PlayerState
import kotlinx.coroutines.delay

/** How often the ring is redrawn locally. Costs nothing over the air. */
private const val TICK_MS = 500L

/**
 * The playing position, ticked from the watch's own clock.
 *
 * The watch never asks the phone where the track is — it extrapolates from the
 * last correction it was given and rebases whenever a new one arrives. That is
 * what keeps the ring smooth at 2Hz of traffic, and completely free while
 * paused.
 */
@Composable
fun rememberPositionMs(state: PlayerState): State<Long> {
  val position = remember { mutableLongStateOf(0L) }
  LaunchedEffect(state) {
    while (true) {
      position.longValue = state.positionAt(SystemClock.elapsedRealtime())
      // A paused track doesn't move, so stop looping until the state changes.
      if (!state.isPlaying) break
      delay(TICK_MS)
    }
  }
  return position
}

fun formatDuration(ms: Long): String {
  if (ms <= 0L) return "0:00"
  val totalSeconds = ms / 1000
  val minutes = totalSeconds / 60
  val seconds = totalSeconds % 60
  return if (minutes >= 60) {
    String.format("%d:%02d:%02d", minutes / 60, minutes % 60, seconds)
  } else {
    String.format("%d:%02d", minutes, seconds)
  }
}
