package expo.modules.upnpcast

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * TEMPORARY (issue #220): a casting log a tester can record and send back.
 *
 * Every SOAP exchange, description, discovery answer and crash goes to a file in
 * the cache directory while recording is on. Written line by line and flushed, and
 * the on/off flag is persisted, so a crash and a relaunch neither lose the lines
 * leading up to it nor stop the recording.
 *
 * Credentials never reach the file: Subsonic and Jellyfin auth query parameters are
 * masked on every line. Host names and LAN addresses are kept on purpose, because
 * whether a speaker can reach the server's address is half of what this is for.
 */
object UpnpTrace {
  @Volatile
  var enabled = false
    private set

  private val lock = Any()
  private var file: File? = null
  private var prefsContext: Context? = null
  private var linesSinceTrim = 0
  private var crashHandlerInstalled = false
  private val lastPollAnswer = ConcurrentHashMap<String, String>()
  private val described = ConcurrentHashMap.newKeySet<String>()
  private val clock = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

  fun init(context: Context) {
    synchronized(lock) {
      if (file != null) return
      val app = context.applicationContext
      prefsContext = app
      file = File(app.cacheDir, TRACE_FILE)
      enabled = prefs(app).getBoolean(PREF_ENABLED, false)
      if (enabled) {
        installCrashHandler()
        write("TRACE", "process started, recording resumed")
        networkSnapshot(app)
      }
    }
  }

  fun setEnabled(context: Context, on: Boolean) {
    synchronized(lock) {
      init(context)
      if (on == enabled) return
      prefs(context).edit().putBoolean(PREF_ENABLED, on).apply()
      if (on) {
        file?.delete()
        lastPollAnswer.clear()
        described.clear()
        enabled = true
        installCrashHandler()
        write("TRACE", "recording started")
        networkSnapshot(context)
      } else {
        write("TRACE", "recording stopped")
        enabled = false
      }
    }
  }

  fun hasLog(): Boolean = synchronized(lock) { (file?.length() ?: 0L) > 0L }

  fun clear() {
    synchronized(lock) {
      file?.delete()
      lastPollAnswer.clear()
      described.clear()
    }
  }

  fun record(tag: String, message: String) {
    if (!enabled) return
    synchronized(lock) { write(tag, message) }
  }

  fun soap(
    action: String,
    controlUrl: String,
    arguments: String,
    outcome: String,
    response: String?,
    elapsedMs: Long
  ) {
    if (!enabled) return
    // A volume drag is a burst of these; one line each, bodies only on a refusal.
    if (action in VOLUME_ACTIONS && response != null && outcome == "HTTP 200") {
      val level = VOLUME_LEVEL.find(arguments)?.groupValues?.get(1) ?: "-"
      record("SOAP", "$action $level -> $controlUrl ($outcome, ${elapsedMs}ms)")
      return
    }
    // Polls repeat twice a second; only an answer that says something new is kept.
    if (action in POLL_ACTIONS && response != null) {
      val key = "$action $controlUrl"
      val meaning = POLL_NOISE.replace(response, "")
      if (lastPollAnswer.put(key, meaning) == meaning) return
    }
    val limit = if (action == "GetZoneGroupState") LONG_BODY_CHARS else BODY_CHARS
    record(
      "SOAP",
      "$action -> $controlUrl ($outcome, ${elapsedMs}ms)\n" +
        "  sent: ${arguments.take(BODY_CHARS)}\n" +
        "  got:  ${response?.take(limit) ?: "-"}"
    )
  }

  fun fetched(url: String, outcome: String, body: String?) {
    if (!enabled) return
    val firstDescription = body != null && body.contains("<device", ignoreCase = true) && described.add(url)
    record(
      "GET",
      "$url ($outcome, ${body?.length ?: 0} chars)" +
        if (firstDescription) "\n${body!!.take(LONG_BODY_CHARS)}" else ""
    )
  }

  /**
   * The diagnostics report and the log in one file, as a share-sheet intent. Null
   * when nothing has been recorded. File work: call off the main thread.
   */
  fun shareIntent(context: Context, header: String): Intent? {
    val text = synchronized(lock) {
      val source = file?.takeIf { it.exists() && it.length() > 0 } ?: return null
      header + "\n\n==== Casting log ====\n" + source.readText()
    }
    val dir = File(context.cacheDir, SHARE_DIR).apply { mkdirs() }
    val out = File(dir, SHARE_FILE).apply { writeText(text) }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.FileSystemFileProvider", out)
    val send = Intent(Intent.ACTION_SEND).apply {
      type = "text/plain"
      putExtra(Intent.EXTRA_STREAM, uri)
      putExtra(Intent.EXTRA_SUBJECT, "Wavio casting log")
      clipData = ClipData.newRawUri(SHARE_FILE, uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    return Intent.createChooser(send, "Wavio casting log")
  }

  private fun networkSnapshot(context: Context) {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
    val active = manager.activeNetwork
    val lines = manager.allNetworks.map { network ->
      val caps = manager.getNetworkCapabilities(network)
      val link = manager.getLinkProperties(network)
      val transports = listOfNotNull(
        "wifi".takeIf { caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true },
        "ethernet".takeIf { caps?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true },
        "cellular".takeIf { caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true },
        "vpn".takeIf { caps?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true }
      ).joinToString("+").ifEmpty { "other" }
      val addresses = link?.linkAddresses?.joinToString { it.toString() } ?: "-"
      val dns = link?.dnsServers?.joinToString { it.hostAddress ?: "?" } ?: "-"
      "  ${if (network == active) "* " else "  "}$transports on ${link?.interfaceName}: $addresses (dns $dns)"
    }
    write("NET", "networks (* = default route):\n" + lines.joinToString("\n"))
  }

  private fun installCrashHandler() {
    if (crashHandlerInstalled) return
    crashHandlerInstalled = true
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      runCatching { record("CRASH", "on ${thread.name}: ${Log.getStackTraceString(error)}") }
      previous?.uncaughtException(thread, error)
    }
  }

  /** Under [lock]. */
  private fun write(tag: String, message: String) {
    val target = file ?: return
    runCatching {
      FileWriter(target, true).use {
        it.append(clock.format(Date())).append(' ').append(tag).append(' ')
          .append(redact(message)).append('\n')
      }
      if (++linesSinceTrim >= TRIM_CHECK_LINES) {
        linesSinceTrim = 0
        if (target.length() > MAX_BYTES) {
          val text = target.readText()
          target.writeText("[earlier lines dropped]\n" + text.takeLast(KEEP_CHARS))
        }
      }
    }
  }

  fun redact(text: String): String = CREDENTIALS.replace(text) { "${it.groupValues[1]}***" }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private const val TRACE_FILE = "upnp-trace.log"
  private const val SHARE_DIR = "upnp-trace-share"
  private const val SHARE_FILE = "wavio-casting-log.txt"
  private const val PREFS = "upnp-trace"
  private const val PREF_ENABLED = "enabled"
  private const val BODY_CHARS = 4000
  private const val LONG_BODY_CHARS = 64000
  private const val TRIM_CHECK_LINES = 200
  private const val MAX_BYTES = 4L * 1024 * 1024
  private const val KEEP_CHARS = 3 * 1024 * 1024
  private val POLL_ACTIONS = setOf("GetTransportInfo", "GetPositionInfo", "GetVolume", "GetGroupVolume")
  private val VOLUME_ACTIONS = setOf("SetGroupVolume", "SetVolume", "SnapshotGroupVolume", "SetRelativeGroupVolume")
  private val VOLUME_LEVEL = Regex("<DesiredVolume>(\\d+)</DesiredVolume>")
  private val POLL_NOISE = Regex("<(RelTime|AbsTime|RelCount|AbsCount)>[^<]*</\\1>")
  // A query parameter carrying a credential, however many times its `&` has been
  // escaped (a stream URL inside DIDL inside SOAP is escaped twice).
  private val CREDENTIALS = Regex(
    "((?:[?&]|&amp;|&amp;amp;)(?:u|p|t|s|apikey|api_key|token|jwt|x-plex-token)=)[^&\\s<>\"']*",
    RegexOption.IGNORE_CASE
  )
}
