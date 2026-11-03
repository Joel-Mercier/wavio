import BackgroundTasks
import Foundation

/**
 * iOS counterpart of AutoBackupScheduler.kt + AutoBackupRun.kt.
 *
 * iOS gives no time-of-day guarantee: `earliestBeginDate` is a floor, and the
 * system picks the actual slot (typically overnight, often while charging). A
 * background launch for the task runs the normal app startup, so JS boots on
 * its own; the slot is handed over once it calls `notifyReady`.
 *
 * All state is confined to the main queue.
 */
final class AutoBackupCoordinator {
  static let shared = AutoBackupCoordinator()

  // Must be listed in Info.plist's BGTaskSchedulerPermittedIdentifiers (app.json).
  static let taskIdentifier = "com.jmercier.wavio.autobackup"

  private weak var module: AutoBackupModule?
  private var jsReady = false
  private var task: BGTask?

  func registerLaunchHandler() {
    // Registering an identifier the Info.plist doesn't permit throws an
    // Objective-C exception, which would take the app down at launch.
    let permitted =
      Bundle.main.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String]
    guard permitted?.contains(Self.taskIdentifier) == true else { return }
    BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskIdentifier, using: .main) {
      [weak self] task in
      self?.handle(task)
    }
  }

  func schedule(minuteOfDay: Int) {
    AutoBackupState.minuteOfDay = minuteOfDay
    submit()
  }

  func cancel() {
    AutoBackupState.minuteOfDay = nil
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskIdentifier)
  }

  func attach(_ instance: AutoBackupModule) {
    DispatchQueue.main.async {
      self.module = instance
      self.jsReady = false
    }
  }

  func detach(_ instance: AutoBackupModule) {
    DispatchQueue.main.async {
      guard self.module === instance else { return }
      self.module = nil
      self.jsReady = false
    }
  }

  func markJsReady(_ instance: AutoBackupModule) {
    DispatchQueue.main.async {
      self.module = instance
      self.jsReady = true
      if self.task != nil { instance.emitDue() }
    }
  }

  func finish(success: Bool) {
    DispatchQueue.main.async {
      self.task?.setTaskCompleted(success: success)
      self.task = nil
    }
  }

  private func handle(_ task: BGTask) {
    submit()
    guard AutoBackupState.pending else {
      task.setTaskCompleted(success: true)
      return
    }
    self.task?.setTaskCompleted(success: false)
    self.task = task
    task.expirationHandler = { [weak self] in self?.finish(success: false) }
    if jsReady, let module { module.emitDue() }
  }

  // A replacing submit: one pending request per identifier.
  private func submit() {
    guard let minuteOfDay = AutoBackupState.minuteOfDay else { return }
    let request = BGProcessingTaskRequest(identifier: Self.taskIdentifier)
    request.earliestBeginDate = Self.nextOccurrence(of: minuteOfDay)
    request.requiresNetworkConnectivity = false
    request.requiresExternalPower = false
    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      // `unavailable` on the simulator and when Background App Refresh is off.
      NSLog("[AutoBackup] could not schedule: \(error)")
    }
  }

  private static func nextOccurrence(of minuteOfDay: Int) -> Date? {
    var components = DateComponents()
    components.hour = minuteOfDay / 60
    components.minute = minuteOfDay % 60
    return Calendar.current.nextDate(
      after: Date().addingTimeInterval(60),
      matching: components,
      matchingPolicy: .nextTime
    )
  }
}
