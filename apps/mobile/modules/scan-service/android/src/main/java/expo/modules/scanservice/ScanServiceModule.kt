package expo.modules.scanservice

import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

/**
 * Start/stop switch for the scan foreground service, plus the SAF directory
 * lister the on-device library scan walks with.
 *
 * Copy is passed in from JS rather than built here so the notification is
 * localized by i18next like everything else the user reads — the native side has
 * no access to the selected locale.
 */
class ScanServiceModule : Module() {
  // expo-file-system's `Directory.list()` plus `.size` / `.modificationTime`
  // costs ~10 synchronous provider IPCs per file on the JS thread (issue #211).
  // One query per directory on our own pool replaces all of them; the shared
  // AsyncFunction queue is serial app-wide, so it can't be that pool.
  private val listExecutor = Executors.newFixedThreadPool(LIST_THREADS) { r ->
    Thread(r, "wavio-saf-list").apply { isDaemon = true }
  }

  override fun definition() = ModuleDefinition {
    Name("ScanService")

    Function("start") { title: String, text: String ->
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(context, ScanForegroundService::class.java).apply {
        putExtra(ScanForegroundService.EXTRA_TITLE, title)
        putExtra(ScanForegroundService.EXTRA_TEXT, text)
      }
      // startForegroundService, not startService: from API 26 a background start
      // of a service that then calls startForeground must use this, or the
      // system throws IllegalStateException. Wrapped because a start racing the
      // app going to the background still throws ForegroundServiceStartNot-
      // AllowedException on API 31+ — the scan itself is unaffected, it just
      // doesn't get the process-lifetime guarantee.
      runCatching { context.startForegroundService(intent) }.isSuccess
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      runCatching {
        context.stopService(Intent(context, ScanForegroundService::class.java))
      }.isSuccess
    }

    AsyncFunction("listDocuments") { uri: String, promise: Promise ->
      listExecutor.execute {
        try {
          promise.resolve(listDocuments(uri))
        } catch (e: Exception) {
          promise.reject("ERR_SAF_LIST", e.message ?: "Listing failed", e)
        }
      }
    }

    // A scan can outlive the JS context but never the process; if the module is
    // being torn down there is nothing left to keep alive.
    OnDestroy {
      appContext.reactContext?.let {
        runCatching { it.stopService(Intent(it, ScanForegroundService::class.java)) }
      }
      listExecutor.shutdownNow()
    }
  }

  /**
   * The children of a SAF tree or tree-document URI, shaped exactly like
   * expo-file-system's `listAsRecords` over `TreeDocumentFile.listFiles`: same
   * child URIs, a trailing `/` on directories, and size / mtime as
   * `DocumentFile.length()` / `lastModified()` report them (0 when absent). The
   * scan index is keyed on those values, so any drift re-extracts or prunes an
   * existing library.
   *
   * Never returns an empty list for a listing that failed: to the scanner an
   * empty directory means its files were deleted.
   */
  private fun listDocuments(uriString: String): List<Map<String, Any>> {
    val context = appContext.reactContext
      ?: throw IllegalStateException("No React context available")
    val uri = Uri.parse(uriString)
    // Read off the segments rather than DocumentsContract.isDocumentUri, which
    // asks the package manager over Binder on every call.
    val segments = uri.pathSegments
    val parentId = if (segments.size >= 4 && segments[2] == "document") {
      DocumentsContract.getDocumentId(uri)
    } else {
      DocumentsContract.getTreeDocumentId(uri)
    }
    val cursor = context.contentResolver.query(
      DocumentsContract.buildChildDocumentsUriUsingTree(uri, parentId),
      PROJECTION,
      null,
      null,
      null,
    ) ?: throw IllegalStateException("No cursor for $uriString")
    return cursor.use {
      val entries = ArrayList<Map<String, Any>>(it.count)
      while (it.moveToNext()) {
        val id = it.getString(0) ?: continue
        val isDirectory = it.getString(1) == Document.MIME_TYPE_DIR
        val child = DocumentsContract.buildDocumentUriUsingTree(uri, id).toString()
        entries.add(
          mapOf(
            "uri" to if (isDirectory && !child.endsWith("/")) "$child/" else child,
            "isDirectory" to isDirectory,
            "size" to (if (it.isNull(2)) 0L else it.getLong(2)).toDouble(),
            "mtime" to (if (it.isNull(3)) 0L else it.getLong(3)).toDouble(),
          ),
        )
      }
      entries
    }
  }

  private companion object {
    // Must equal the device source's listConcurrency in
    // services/fileSource/device.ts: a fifth in-flight listing would only park
    // in this pool.
    const val LIST_THREADS = 4

    val PROJECTION = arrayOf(
      Document.COLUMN_DOCUMENT_ID,
      Document.COLUMN_MIME_TYPE,
      Document.COLUMN_SIZE,
      Document.COLUMN_LAST_MODIFIED,
    )
  }
}
