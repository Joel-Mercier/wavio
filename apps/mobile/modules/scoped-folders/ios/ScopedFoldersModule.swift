import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

// Folder access that survives a relaunch.
//
// A folder picked through UIDocumentPickerViewController is only readable while
// its security-scoped access is open, and the URL itself is worthless in the next
// process. What carries over is a *bookmark* (`URL.bookmarkData`): resolving it
// hands back a URL that `startAccessingSecurityScopedResource` accepts again.
// expo-file-system's own `pickDirectoryAsync` opens the scope but never makes a
// bookmark, which is the whole reason this module exists.
//
// Access is started once per folder and held for the life of the process: the
// sandbox extension it consumes is process-wide, so expo-file-system's plain
// `file://` Directory/File, AVURLAsset and AVPlayer all read through it without
// ever seeing this module. Folder counts are small, far below the kernel limit
// on open scoped resources.
//
// Everything runs on the main queue: the picker has to, and `held` is then only
// ever touched from one thread.
public class ScopedFoldersModule: Module {
  private var picking: (delegate: PickerDelegate, promise: Promise)?
  private var held: [String: URL] = [:]

  public func definition() -> ModuleDefinition {
    Name("ScopedFolders")

    Constants([
      "applicationSupportDirectory": Self.applicationSupportDirectory()
    ])

    AsyncFunction("pickFolder") { (promise: Promise) in
      guard self.picking == nil else {
        promise.reject(PickingInProgressException())
        return
      }
      guard let controller = self.appContext?.utilities?.currentViewController() else {
        promise.reject(MissingViewControllerException())
        return
      }
      let picker = UIDocumentPickerViewController(
        forOpeningContentTypes: [UTType.folder], asCopy: false)
      let delegate = PickerDelegate { [weak self] url in
        guard let self else { return }
        let promise = self.picking?.promise
        self.picking = nil
        guard let url else {
          promise?.resolve(nil)
          return
        }
        do {
          promise?.resolve(try self.hold(url))
        } catch {
          promise?.reject(error)
        }
      }
      picker.delegate = delegate
      picker.presentationController?.delegate = delegate
      picker.allowsMultipleSelection = false
      self.picking = (delegate, promise)
      controller.present(picker, animated: true)
    }
    .runOnQueue(.main)

    AsyncFunction("resolveFolder") { (bookmark: String) -> [String: Any]? in
      guard let data = Data(base64Encoded: bookmark) else {
        throw InvalidBookmarkException()
      }
      var stale = false
      let url: URL
      do {
        url = try URL(
          resolvingBookmarkData: data, options: [], relativeTo: nil,
          bookmarkDataIsStale: &stale)
      } catch {
        // The folder was deleted, or its provider is gone: nothing to resolve.
        return nil
      }
      var result = try self.hold(url)
      result["stale"] = stale
      return result
    }
    .runOnQueue(.main)
  }

  // Opens (or reuses) access to `url` and returns it with a fresh bookmark. The
  // bookmark is re-created even for an already-held folder so a stale one is
  // always replaced by the caller.
  private func hold(_ url: URL) throws -> [String: Any] {
    // Directory URLs carry a trailing slash; the JS side joins relative paths
    // onto this string, so hand out (and key on) the slash-less form.
    var key = url.absoluteString
    if key.hasSuffix("/") { key.removeLast() }
    if held[key] == nil {
      // `false` means the URL needs no scope — a folder inside the app's own
      // container, which Files also offers — not that access was refused, so it
      // isn't an error (expo-file-system ignores it the same way). A folder that
      // really can't be read fails at the first listing instead.
      _ = url.startAccessingSecurityScopedResource()
      held[key] = url
    }
    let data: Data
    do {
      data = try url.bookmarkData(
        options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
    } catch {
      throw BookmarkFailedException(url.path)
    }
    return [
      "uri": key,
      "bookmark": data.base64EncodedString(),
      "name": url.lastPathComponent,
    ]
  }

  private static func applicationSupportDirectory() -> String {
    let url = FileManager.default.urls(
      for: .applicationSupportDirectory, in: .userDomainMask
    ).first!
    try? FileManager.default.createDirectory(
      at: url, withIntermediateDirectories: true)
    return url.absoluteString
  }
}

private final class PickerDelegate: NSObject, UIDocumentPickerDelegate,
  UIAdaptivePresentationControllerDelegate
{
  private let onFinish: (URL?) -> Void

  init(onFinish: @escaping (URL?) -> Void) {
    self.onFinish = onFinish
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]
  ) {
    onFinish(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    onFinish(nil)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    onFinish(nil)
  }
}

final class PickingInProgressException: Exception {
  override var code: String { "ERR_PICKING_IN_PROGRESS" }
  override var reason: String { "A folder picker is already open" }
}

final class MissingViewControllerException: Exception {
  override var code: String { "ERR_NO_VIEW_CONTROLLER" }
  override var reason: String { "No view controller to present the folder picker on" }
}

final class InvalidBookmarkException: Exception {
  override var code: String { "ERR_INVALID_BOOKMARK" }
  override var reason: String { "Bookmark is not valid base64" }
}

final class BookmarkFailedException: GenericException<String> {
  override var code: String { "ERR_BOOKMARK_FAILED" }
  override var reason: String { "Could not create a bookmark for \(param)" }
}
