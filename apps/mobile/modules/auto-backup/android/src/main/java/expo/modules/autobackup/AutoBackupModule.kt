package expo.modules.autobackup

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AutoBackupModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AutoBackup")

    Events("due")

    OnCreate {
      AutoBackupRun.attach(this@AutoBackupModule)
    }

    OnDestroy {
      AutoBackupRun.detach(this@AutoBackupModule)
    }

    Function("schedule") { hour: Int, minute: Int ->
      AutoBackupScheduler.schedule(context, hour, minute)
    }

    Function("cancel") {
      AutoBackupScheduler.cancel(context)
    }

    Function("setPending") { pending: Boolean ->
      AutoBackupState.setPending(context, pending)
    }

    Function("isPending") {
      AutoBackupState.isPending(context)
    }

    // Called once JS has subscribed to `due`; a run waiting on a cold boot is
    // handed over here.
    Function("notifyReady") {
      AutoBackupRun.markJsReady(this@AutoBackupModule)
    }

    Function("reportDone") {
      AutoBackupRun.finish()
    }
  }

  internal fun emitDue() {
    sendEvent("due", emptyMap<String, Any>())
  }
}
