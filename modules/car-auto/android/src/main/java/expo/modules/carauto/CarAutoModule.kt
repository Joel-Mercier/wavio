package expo.modules.carauto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CarAutoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CarAuto")

    Events("play")

    OnCreate {
      instance = this@CarAutoModule
    }

    OnDestroy {
      if (instance === this@CarAutoModule) instance = null
    }

    Function("setTree") { json: String ->
      BrowseTreeCache.setFromJson(json)
    }
  }

  fun emitPlayEvent(mediaId: String) {
    sendEvent("play", mapOf("mediaId" to mediaId))
  }

  companion object {
    @Volatile var instance: CarAutoModule? = null
      private set
  }
}
