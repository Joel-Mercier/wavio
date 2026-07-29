package com.jmercier.wavio.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.jmercier.wavio.wear.data.CommandSender
import com.jmercier.wavio.wear.data.PhoneRepository
import com.jmercier.wavio.wear.ui.WearApp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
  private lateinit var repository: PhoneRepository
  private lateinit var commands: CommandSender

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    repository = PhoneRepository(applicationContext)
    commands = CommandSender(applicationContext) { reachable ->
      repository.setReachable(reachable)
    }
    setContent { WearApp(repository, commands) }

    // The subscription is a lease the phone lets expire, so it has to be
    // renewed while the screen stays on. Being killed outright (swipe-away,
    // crash) is the case `unsubscribe` cannot cover, and the phone has no other
    // way to notice: this app advertises its capability as long as it is
    // installed, running or not.
    lifecycleScope.launch {
      repeatOnLifecycle(Lifecycle.State.RESUMED) {
        while (isActive) {
          delay(SUBSCRIBE_HEARTBEAT_MS)
          commands.subscribe()
        }
      }
    }
  }

  override fun onResume() {
    super.onResume()
    repository.start(lifecycleScope)
    // `hello` announces us in case the phone's capability lookup missed this
    // watch; `subscribe` is what actually starts the 2Hz progress corrections.
    // Both make the phone republish its state, so a resume always lands on the
    // truth rather than whatever was retained.
    commands.hello()
    commands.subscribe()
    lifecycleScope.launch { repository.refresh() }
  }

  override fun onPause() {
    // Screen off or app backgrounded: stop the phone sending progress. This is
    // the whole battery story — a wrist-down watch costs no traffic at all.
    commands.unsubscribe()
    repository.stop()
    super.onPause()
  }

  private companion object {
    /** Comfortably under the phone's 45s lease, so two may go missing. */
    const val SUBSCRIBE_HEARTBEAT_MS = 15_000L
  }
}
