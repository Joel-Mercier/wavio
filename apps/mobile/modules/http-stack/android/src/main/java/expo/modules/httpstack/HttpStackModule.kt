package expo.modules.httpstack

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HttpStackModule : Module() {
  private val onChange: () -> Unit = { sendEvent("change", emptyMap<String, Any>()) }

  override fun definition() = ModuleDefinition {
    Name("HttpStack")

    Events("change")

    OnStartObserving {
      HttpStack.setChangeListener(onChange)
    }

    OnStopObserving {
      HttpStack.clearChangeListener(onChange)
    }

    OnDestroy {
      HttpStack.clearChangeListener(onChange)
    }

    Function("setHttp3Enabled") { enabled: Boolean ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      HttpStack.setHttp3Enabled(context, enabled)
    }

    Function("getEngineState") {
      CronetEngineHolder.state.wire
    }

    Function("getHostTransport") { host: String ->
      mapOf(
        "protocol" to TransportStats.protocolFor(host),
        "blocker" to TransportPolicy.blockerFor(host, HttpStack.vetoes.values)?.wire,
      )
    }
  }
}
