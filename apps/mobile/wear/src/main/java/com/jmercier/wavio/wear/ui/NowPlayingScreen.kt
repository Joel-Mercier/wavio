package com.jmercier.wavio.wear.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import com.jmercier.wavio.wear.R
import com.jmercier.wavio.wear.data.CommandSender
import com.jmercier.wavio.wear.data.PhoneRepository
import kotlinx.coroutines.delay

/** Milliseconds of seek per pixel of rotary scroll. One full crank ≈ 30s. */
private const val ROTARY_MS_PER_PIXEL = 120L

/** Rotary settles before we send, so a long crank is one command, not fifty. */
private const val SEEK_DEBOUNCE_MS = 350L

private const val NO_PENDING_SEEK = -1L

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun NowPlayingScreen(
  repository: PhoneRepository,
  commands: CommandSender,
  onOpenQueue: () -> Unit,
) {
  val state by repository.state.collectAsStateWithLifecycle()
  val artwork by repository.artwork.collectAsStateWithLifecycle()
  val reachable by repository.phoneReachable.collectAsStateWithLifecycle()
  val tickedPosition by rememberPositionMs(state)

  // While the crown is turning we show where the user is scrubbing to, not
  // where the phone still is.
  var pendingSeek by remember { mutableLongStateOf(NO_PENDING_SEEK) }
  val duration = state.track?.durationMs ?: 0L
  val position = if (pendingSeek >= 0L) pendingSeek else tickedPosition

  LaunchedEffect(pendingSeek) {
    if (pendingSeek < 0L) return@LaunchedEffect
    delay(SEEK_DEBOUNCE_MS)
    commands.seek(pendingSeek)
    pendingSeek = NO_PENDING_SEEK
  }

  val focusRequester = remember { FocusRequester() }
  LaunchedEffect(Unit) { runCatching { focusRequester.requestFocus() } }

  Scaffold(timeText = { TimeText() }) {
    Box(
      modifier = Modifier
        .fillMaxSize()
        .onRotaryScrollEvent { event ->
          if (!state.canSeek || duration <= 0L) return@onRotaryScrollEvent false
          val base = if (pendingSeek >= 0L) pendingSeek else tickedPosition
          val delta = (event.verticalScrollPixels * ROTARY_MS_PER_PIXEL).toLong()
          pendingSeek = (base + delta).coerceIn(0L, duration)
          true
        }
        .focusRequester(focusRequester)
        .focusable(),
      contentAlignment = Alignment.Center,
    ) {
      if (duration > 0L) {
        CircularProgressIndicator(
          progress = (position.toFloat() / duration.toFloat()).coerceIn(0f, 1f),
          modifier = Modifier.fillMaxSize().padding(2.dp),
          startAngle = 292.5f,
          endAngle = 247.5f,
          strokeWidth = 4.dp,
        )
      }

      Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 26.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
      ) {
        val bitmap = artwork
        if (bitmap != null) {
          Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = stringResource(R.string.cd_artwork),
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(40.dp).clip(CircleShape),
          )
        } else {
          Icon(
            painter = painterResource(R.drawable.ic_album),
            contentDescription = null,
            modifier = Modifier.size(28.dp).alpha(0.5f),
          )
        }

        Spacer(Modifier.height(6.dp))

        Text(
          text = state.track?.title
            ?: stringResource(
              if (state.known) R.string.nothing_playing else R.string.open_on_phone,
            ),
          style = MaterialTheme.typography.title3,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          textAlign = TextAlign.Center,
        )
        state.track?.artist?.let {
          Text(
            text = it,
            style = MaterialTheme.typography.caption2,
            color = MaterialTheme.colors.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
          )
        }

        if (!reachable) {
          Text(
            text = stringResource(R.string.phone_unreachable),
            style = MaterialTheme.typography.caption3,
            color = MaterialTheme.colors.error,
            maxLines = 1,
            textAlign = TextAlign.Center,
          )
        } else if (duration > 0L) {
          Text(
            text = "${formatDuration(position)} / ${formatDuration(duration)}",
            style = MaterialTheme.typography.caption3,
            color = MaterialTheme.colors.onSurfaceVariant,
            maxLines = 1,
          )
        }

        Spacer(Modifier.height(8.dp))

        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          ControlButton(
            icon = R.drawable.ic_skip_previous,
            description = stringResource(R.string.cd_previous),
            onClick = commands::previous,
          )
          Button(
            onClick = { if (state.isPlaying) commands.pause() else commands.play() },
            modifier = Modifier.size(48.dp),
          ) {
            Icon(
              painter = painterResource(
                if (state.isPlaying) R.drawable.ic_pause else R.drawable.ic_play,
              ),
              contentDescription = stringResource(
                if (state.isPlaying) R.string.cd_pause else R.string.cd_play,
              ),
              modifier = Modifier.size(24.dp),
            )
          }
          ControlButton(
            icon = R.drawable.ic_skip_next,
            description = stringResource(R.string.cd_next),
            onClick = commands::next,
          )
        }

        Spacer(Modifier.height(4.dp))

        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          ControlButton(
            icon = R.drawable.ic_shuffle,
            description = stringResource(R.string.cd_shuffle),
            active = state.shuffle,
            size = 28.dp,
            onClick = { commands.setShuffle(!state.shuffle) },
          )
          ControlButton(
            icon = R.drawable.ic_queue,
            description = stringResource(R.string.cd_queue),
            size = 28.dp,
            onClick = onOpenQueue,
          )
          ControlButton(
            icon = if (state.repeatMode == "one") {
              R.drawable.ic_repeat_one
            } else {
              R.drawable.ic_repeat
            },
            description = stringResource(R.string.cd_repeat),
            active = state.repeatMode != "off",
            size = 28.dp,
            onClick = { commands.setRepeat(nextRepeatMode(state.repeatMode)) },
          )
        }
      }
    }
  }
}

/** off → all → one → off, matching the phone's cycle. */
private fun nextRepeatMode(current: String): String = when (current) {
  "off" -> "all"
  "all" -> "one"
  else -> "off"
}

@Composable
private fun ControlButton(
  icon: Int,
  description: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  active: Boolean = false,
  size: Dp = 36.dp,
) {
  Button(
    onClick = onClick,
    modifier = modifier.size(size),
    colors = if (active) {
      ButtonDefaults.primaryButtonColors()
    } else {
      ButtonDefaults.secondaryButtonColors()
    },
  ) {
    Icon(
      painter = painterResource(icon),
      contentDescription = description,
      modifier = Modifier.size(size * 0.55f),
    )
  }
}
