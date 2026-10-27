import Foundation

// Mirrors AutoBackupState.kt: `pending` lets a slot on a day the app wasn't
// used complete without waking JS.
enum AutoBackupState {
  private static let defaults = UserDefaults.standard
  private static let pendingKey = "wavioAutoBackup.pending"
  private static let minuteOfDayKey = "wavioAutoBackup.minuteOfDay"

  static var pending: Bool {
    get { defaults.bool(forKey: pendingKey) }
    set { defaults.set(newValue, forKey: pendingKey) }
  }

  static var minuteOfDay: Int? {
    get { defaults.object(forKey: minuteOfDayKey) as? Int }
    set {
      if let newValue {
        defaults.set(newValue, forKey: minuteOfDayKey)
      } else {
        defaults.removeObject(forKey: minuteOfDayKey)
      }
    }
  }
}
