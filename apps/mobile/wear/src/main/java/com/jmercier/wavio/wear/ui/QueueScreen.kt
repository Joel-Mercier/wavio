package com.jmercier.wavio.wear.ui

import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import com.jmercier.wavio.wear.R
import com.jmercier.wavio.wear.data.CommandSender
import com.jmercier.wavio.wear.data.PhoneRepository

/**
 * A window of the phone's queue. Rows carry their absolute index (the phone
 * only sends a slice — see QUEUE_WINDOW_* in protocol.ts) so tapping one seeks
 * the phone to the right track regardless of how far into a long queue it is.
 */
@Composable
fun QueueScreen(
  repository: PhoneRepository,
  commands: CommandSender,
  onPicked: () -> Unit,
) {
  val queue by repository.queue.collectAsStateWithLifecycle()
  val listState = rememberScalingLazyListState()

  Scaffold(
    timeText = { TimeText() },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) },
  ) {
    ScalingLazyColumn(
      modifier = Modifier.fillMaxWidth(),
      state = listState,
    ) {
      item {
        ListHeader {
          Text(
            text = if (queue.total > 0) {
              "${stringResource(R.string.queue)} · ${queue.total}"
            } else {
              stringResource(R.string.queue)
            },
          )
        }
      }

      if (queue.tracks.isEmpty()) {
        item {
          Text(
            text = stringResource(R.string.queue_empty),
            style = MaterialTheme.typography.caption2,
            color = MaterialTheme.colors.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 12.dp),
          )
        }
      }

      items(queue.tracks.size) { offset ->
        val entry = queue.tracks[offset]
        val absoluteIndex = queue.baseIndex + offset
        val isCurrent = absoluteIndex == queue.currentIndex
        val artist = entry.artist
        // Typed explicitly: a composable lambda with a receiver doesn't infer
        // reliably through a null-check expression.
        val secondaryLabel: (@Composable RowScope.() -> Unit)? =
          if (artist == null) {
            null
          } else {
            { Text(text = artist, maxLines = 1, overflow = TextOverflow.Ellipsis) }
          }
        Chip(
          modifier = Modifier.fillMaxWidth(),
          onClick = {
            commands.seekToIndex(absoluteIndex)
            onPicked()
          },
          colors = if (isCurrent) {
            ChipDefaults.primaryChipColors()
          } else {
            ChipDefaults.secondaryChipColors()
          },
          label = {
            Text(
              text = entry.title ?: stringResource(R.string.unknown_track),
              maxLines = 1,
              overflow = TextOverflow.Ellipsis,
            )
          },
          secondaryLabel = secondaryLabel,
        )
      }
    }
  }
}
