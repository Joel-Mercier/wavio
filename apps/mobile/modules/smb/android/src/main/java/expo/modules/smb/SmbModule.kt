package expo.modules.smb

import com.hierynomus.msfscc.FileAttributes
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

/**
 * SMB2/3 file access for the network-share library backend.
 *
 * Every function takes its target rather than being configured once, so JS never
 * has to push credentials down here or sequence a `connect` before anything else:
 * `bridgeUrl` can be the first call after a cold start. `SmbConnection` caches the
 * session behind that, keyed on the target, so passing it each time costs nothing.
 *
 * Reading bytes is deliberately *not* exposed. Playback needs an HTTP bridge
 * anyway (nothing in Media3 speaks SMB), so the JS side reads ranges through that
 * same bridge — one path to get right, exercised from the first scan rather than
 * first at playback. See services/fileSource/smb.ts.
 */
class SmbModule : Module() {
  // `AsyncFunction` runs on a dispatcher shared with every other Expo module, and
  // a directory listing over a sleeping NAS can block for seconds. Own the
  // threads — same reasoning as modules/audio-waveform.
  private val executor = Executors.newFixedThreadPool(LIST_THREADS) { r ->
    Thread(r, "wavio-smb").apply { isDaemon = true }
  }

  override fun definition() = ModuleDefinition {
    Name("Smb")

    // Synchronous because FileSource.playableUrl is, and it is called during a
    // track change. Only binds a loopback socket; no SMB traffic happens here.
    Function("bridgeUrl") { target: SmbTarget, path: String, timeoutMs: Int ->
      SmbBridge.urlFor(target, path, timeoutMs.toLong())
    }

    AsyncFunction("list") { target: SmbTarget, path: String, timeoutMs: Int, promise: Promise ->
      submit(promise) { list(target, path, timeoutMs.toLong()) }
    }

    AsyncFunction("exists") { target: SmbTarget, path: String, timeoutMs: Int, promise: Promise ->
      submit(promise) {
        SmbConnection.withShare(target, timeoutMs.toLong()) { share ->
          share.folderExists(path) || share.fileExists(path)
        }
      }
    }

    /**
     * Reachability and credential check in one, used by both the login flow and
     * the periodic server probe. Rejects with a coded error so login can tell
     * "wrong password" from "no such share" from "nothing there".
     */
    AsyncFunction("probe") { target: SmbTarget, timeoutMs: Int, promise: Promise ->
      submit(promise) {
        SmbConnection.withShare(target, timeoutMs.toLong()) { share ->
          share.folderExists("/")
        }
      }
    }

    /** Drops the cached session — on sign-out, or a switch to another server. */
    AsyncFunction("disconnect") { promise: Promise ->
      submit(promise) {
        SmbBridge.stop()
        SmbConnection.reset()
        true
      }
    }

    OnDestroy {
      SmbBridge.stop()
      SmbConnection.reset()
      executor.shutdownNow()
    }
  }

  private fun <T> submit(promise: Promise, work: () -> T) {
    executor.execute {
      try {
        promise.resolve(work())
      } catch (e: SmbFailure) {
        promise.reject(e)
      } catch (e: Exception) {
        promise.reject(
          SmbUnreachableException("${e.javaClass.simpleName}: ${e.message}"),
        )
      }
    }
  }

  private fun list(
    target: SmbTarget,
    path: String,
    timeoutMs: Long,
  ): List<Map<String, Any>> =
    SmbConnection.withShare(target, timeoutMs) { share ->
      share.list(path).mapNotNull { entry ->
        val name = entry.fileName
        if (name == "." || name == "..") return@mapNotNull null
        // Parenthesized: Kotlin's infix `and` binds looser than `!=`, so without
        // them this compares the mask to a Boolean.
        val isDirectory =
          (entry.fileAttributes and
            FileAttributes.FILE_ATTRIBUTE_DIRECTORY.value) != 0L
        mapOf(
          "name" to name,
          "isDirectory" to isDirectory,
          // The indexer's incremental skip keys on (uri, size, mtime), and both
          // come back with the listing — so a re-scan costs one round trip per
          // directory and nothing per file.
          "size" to if (isDirectory) 0.0 else entry.endOfFile.toDouble(),
          "mtime" to entry.lastWriteTime.toEpochMillis().toDouble(),
        )
      }
    }

  private companion object {
    // Directory listings during a scan run at the source's extractConcurrency;
    // this only has to keep up with them, not exceed them.
    const val LIST_THREADS = 4
  }
}
