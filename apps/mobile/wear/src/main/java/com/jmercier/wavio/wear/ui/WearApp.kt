package com.jmercier.wavio.wear.ui

import androidx.compose.runtime.Composable
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.jmercier.wavio.wear.data.CommandSender
import com.jmercier.wavio.wear.data.PhoneRepository

private const val ROUTE_PLAYER = "player"
private const val ROUTE_QUEUE = "queue"

@Composable
fun WearApp(repository: PhoneRepository, commands: CommandSender) {
  val navController = rememberSwipeDismissableNavController()
  MaterialTheme {
    SwipeDismissableNavHost(
      navController = navController,
      startDestination = ROUTE_PLAYER,
    ) {
      composable(ROUTE_PLAYER) {
        NowPlayingScreen(
          repository = repository,
          commands = commands,
          onOpenQueue = { navController.navigate(ROUTE_QUEUE) },
        )
      }
      composable(ROUTE_QUEUE) {
        QueueScreen(
          repository = repository,
          commands = commands,
          onPicked = { navController.popBackStack() },
        )
      }
    }
  }
}
