import ExpoModulesCore

public class AutoBackupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AutoBackup")

    Events("due")

    OnCreate {
      AutoBackupCoordinator.shared.attach(self)
    }

    OnDestroy {
      AutoBackupCoordinator.shared.detach(self)
    }

    Function("schedule") { (hour: Int, minute: Int) in
      AutoBackupCoordinator.shared.schedule(minuteOfDay: hour * 60 + minute)
    }

    Function("cancel") {
      AutoBackupCoordinator.shared.cancel()
    }

    Function("setPending") { (pending: Bool) in
      AutoBackupState.pending = pending
    }

    Function("isPending") { () -> Bool in
      AutoBackupState.pending
    }

    Function("notifyReady") {
      AutoBackupCoordinator.shared.markJsReady(self)
    }

    Function("reportDone") {
      AutoBackupCoordinator.shared.finish(success: true)
    }
  }

  func emitDue() {
    sendEvent("due", [:])
  }
}
