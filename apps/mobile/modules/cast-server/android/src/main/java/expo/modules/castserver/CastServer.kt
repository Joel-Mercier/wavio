package expo.modules.castserver

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.SynchronousQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Serves the tracks and covers of a cast session to the receiver playing it.
 *
 * A Chromecast or UPnP renderer is handed a URL and fetches it itself, which works
 * for a music server but not for a library this phone reads: files on its own
 * storage, an SMB share behind a loopback bridge, a WebDAV server that wants an
 * `Authorization` header no receiver can send. So for those the phone serves the
 * bytes, on its Wi-Fi address, for as long as the session lasts.
 *
 * What it exposes is deliberately narrow:
 * - nothing outside a session: the listener opens with [startSession] and closes
 *   with [endSession];
 * - nothing that wasn't registered: a URL is `/<session token>/<key>.<ext>`, the
 *   token is 128 random bits per session and the key names one registered source,
 *   so there are no paths to guess and nothing to list;
 * - nothing on a network a receiver isn't on (see [RouteAddress]).
 *
 * Keys are derived from the session token and the track id, so registering the same
 * track again in the same session gives the same URL. That, plus JS persisting the
 * token and port, is what lets a renderer that kept playing while the app was dead
 * fetch its next range from the restarted app. The URL carries nothing else: no
 * track id, no path, nothing a receiver's logs could give away.
 */
internal object CastServer {
  private const val BACKLOG = 16

  // A receiver holds one connection per range it reads, rarely more than two at
  // once; a Sonos group's coordinator fetches for every room. Over the ceiling a
  // connection is refused at once rather than queued behind a four-minute track.
  private const val CORE_WORKERS = 1
  private const val MAX_WORKERS = 8
  private const val WORKER_KEEPALIVE_SECONDS = 60L

  private const val HEAD_TIMEOUT_MS = 5_000
  // An SMB or WebDAV read can stall on a NAS waking from sleep.
  private const val BODY_TIMEOUT_MS = 30_000

  // The current track, the next, their covers, and the ones a receiver may still be
  // finishing: anything older is evicted.
  private const val MAX_ENTRIES = 16

  private val random = SecureRandom()
  private val lock = Any()

  private var context: Context? = null
  private var locks: ServingLocks? = null

  @Volatile private var serverSocket: ServerSocket? = null
  private var boundAddress: InetAddress? = null
  private var token: String? = null
  private var receiver: InetAddress? = null

  private class Entry(val source: MediaSource, val mime: String, val dlna: HttpWire.Dlna)

  // Access-ordered, so eviction drops the least recently served.
  private val entries = object : LinkedHashMap<String, Entry>(MAX_ENTRIES, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Entry>?) =
      size > MAX_ENTRIES
  }
  private val requestCounts = ConcurrentHashMap<String, AtomicInteger>()
  private val sessionRequests = AtomicInteger()
  private val clients = ConcurrentHashMap.newKeySet<Socket>()

  @Volatile var requestEvents = false
  @Volatile var onRequest: ((Map<String, Any?>) -> Unit)? = null

  private val pool = ThreadPoolExecutor(
    CORE_WORKERS,
    MAX_WORKERS,
    WORKER_KEEPALIVE_SECONDS,
    TimeUnit.SECONDS,
    SynchronousQueue<Runnable>(),
  ) { r -> Thread(r, "wavio-cast-server").apply { isDaemon = true } }

  fun init(appContext: Context) {
    synchronized(lock) {
      if (context != null) return
      context = appContext
      locks = ServingLocks(appContext)
    }
  }

  /**
   * Opens (or keeps) the listener for a session with the receiver at [receiverHost].
   *
   * [preferredToken] continues a session — after a restart, the renderer still holds
   * URLs carrying it — and [preferredPort] is tried before any other, for the same
   * reason. Returns the host, port and token in use, or null when the phone is on no
   * network a receiver could reach it on.
   */
  fun startSession(receiverHost: String, preferredPort: Int, preferredToken: String?): Map<String, Any>? {
    val appContext = context ?: return null
    val target = RouteAddress.literal(receiverHost)
    val address = RouteAddress.forReceiver(appContext, target) ?: return null
    synchronized(lock) {
      val nextToken = preferredToken?.takeIf { TOKEN_SHAPE.matches(it) } ?: token ?: newToken()
      if (nextToken != token) {
        entries.clear()
        requestCounts.clear()
        sessionRequests.set(0)
      }
      token = nextToken
      receiver = target
      val socket = ensureListening(address, preferredPort) ?: return null
      return mapOf(
        "host" to (address.hostAddress ?: ""),
        "port" to socket.localPort,
        "token" to nextToken,
      )
    }
  }

  /**
   * The URL a receiver fetches [id] from, or null without a session. Moves the
   * listener first if the phone's address on the receiver's network has changed
   * since the session began (a new DHCP lease, a switch between access points):
   * a URL on the old address would only ever time out.
   */
  fun register(id: String, record: Map<String, Any?>, ext: String, mime: String): String? {
    val appContext = context ?: return null
    val source = MediaSource.from(appContext, record) ?: return null
    synchronized(lock) {
      val currentToken = token ?: return null
      val address = RouteAddress.forReceiver(appContext, receiver) ?: return null
      val socket = ensureListening(address, serverSocket?.localPort ?: 0) ?: return null
      val key = keyFor(currentToken, id)
      val dlna = if (mime.startsWith("image/")) HttpWire.DLNA_IMAGE else HttpWire.DLNA_AUDIO
      entries[key] = Entry(source, mime, dlna)
      val suffix = ext.lowercase().takeIf { EXT_SHAPE.matches(it) } ?: "bin"
      return "http://${RouteAddress.authority(address, socket.localPort)}/$currentToken/$key.$suffix"
    }
  }

  /** How many requests reached [url] — zero after a failed load means the receiver never got through. */
  fun requestCount(url: String): Int {
    val key = keyOf(Uri.parse(url).path ?: return 0) ?: return 0
    return requestCounts[key]?.get() ?: 0
  }

  /** Requests answered for any registered source this session. */
  fun sessionRequestCount(): Int = sessionRequests.get()

  fun setServing(active: Boolean) {
    if (serverSocket == null) return
    locks?.setActive(active)
  }

  fun endSession() {
    synchronized(lock) {
      runCatching { serverSocket?.close() }
      serverSocket = null
      boundAddress = null
      token = null
      receiver = null
      entries.clear()
      requestCounts.clear()
      sessionRequests.set(0)
    }
    clients.forEach { runCatching { it.close() } }
    locks?.release()
  }

  // ── Listener ────────────────────────────────────────────────────────────────

  private fun ensureListening(address: InetAddress, preferredPort: Int): ServerSocket? {
    val existing = serverSocket
    if (existing != null && !existing.isClosed && boundAddress == address) return existing
    runCatching { existing?.close() }
    val socket = bind(address, preferredPort) ?: return null
    serverSocket = socket
    boundAddress = address
    Thread({ acceptLoop(socket) }, "wavio-cast-accept").apply {
      isDaemon = true
      start()
    }
    return socket
  }

  private fun bind(address: InetAddress, preferredPort: Int): ServerSocket? {
    val ports = if (preferredPort in 1024..65535) listOf(preferredPort, 0) else listOf(0)
    for (port in ports) {
      val socket = ServerSocket()
      try {
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(address, port), BACKLOG)
        return socket
      } catch (_: IOException) {
        runCatching { socket.close() }
      }
    }
    return null
  }

  private fun acceptLoop(socket: ServerSocket) {
    try {
      while (!socket.isClosed) {
        val client = try {
          socket.accept()
        } catch (_: IOException) {
          return
        }
        try {
          pool.execute { serve(client) }
        } catch (_: Exception) {
          runCatching { client.close() }
        }
      }
    } finally {
      // Only disown what is still ours: a rebind may already have replaced it.
      synchronized(lock) {
        if (serverSocket === socket) {
          serverSocket = null
          boundAddress = null
        }
      }
      runCatching { socket.close() }
    }
  }

  // ── One request ─────────────────────────────────────────────────────────────

  private fun serve(client: Socket) {
    val started = SystemClock.elapsedRealtime()
    var method = "?"
    var key: String? = null
    var range: String? = null
    var served = Served(0, 0)
    var output: BufferedOutputStream? = null
    clients.add(client)
    try {
      client.tcpNoDelay = true
      client.soTimeout = HEAD_TIMEOUT_MS
      val input = BufferedInputStream(client.getInputStream())
      val out = BufferedOutputStream(client.getOutputStream())
      output = out
      val head = HttpWire.readHead(input) ?: return
      client.soTimeout = BODY_TIMEOUT_MS
      locks?.touch()

      val request = head.first().split(" ")
      if (request.size < 3) {
        HttpWire.writeHead(out, 400, "Bad Request")
        served = Served(400, 0)
        return
      }
      method = request[0].uppercase()
      if (method != "GET" && method != "HEAD") {
        HttpWire.writeHead(out, 405, "Method Not Allowed")
        served = Served(405, 0)
        return
      }
      val path = request[1].substringBefore('?')
      val found = keyOf(path)
      key = found
      val entry = if (found != null) lookup(found) else null
      // 404 for a wrong token as much as for an unknown key: nothing here should
      // confirm that this port serves anything at all.
      if (found == null || entry == null) {
        HttpWire.writeHead(out, 404, "Not Found")
        served = Served(404, 0)
        return
      }
      requestCounts.getOrPut(found) { AtomicInteger() }.incrementAndGet()
      sessionRequests.incrementAndGet()
      range = HttpWire.header(head, "range")
      served = entry.source.serve(method, range, out, entry.mime, entry.dlna)
    } catch (_: Exception) {
      // A receiver hanging up mid-body is routine: every seek abandons a connection.
    } finally {
      runCatching { output?.flush() }
      runCatching { client.close() }
      clients.remove(client)
      locks?.touch()
      report(client, method, key, range, served, SystemClock.elapsedRealtime() - started)
    }
  }

  private fun lookup(key: String): Entry? = synchronized(lock) { entries[key] }

  /**
   * The key from `/<token>/<key>.<ext>`, or null when the token isn't this
   * session's. Compared in constant time, so a wrong guess learns nothing about how
   * much of it was right.
   */
  private fun keyOf(path: String): String? {
    val segments = path.trim('/').split('/')
    if (segments.size != 2) return null
    val current = synchronized(lock) { token } ?: return null
    if (!HttpWire.constantTimeEquals(current, segments[0])) return null
    return segments[1].substringBefore('.').takeIf { KEY_SHAPE.matches(it) }
  }

  private fun report(
    client: Socket,
    method: String,
    key: String?,
    range: String?,
    served: Served,
    elapsedMs: Long,
  ) {
    if (!requestEvents) return
    val listener = onRequest ?: return
    val from = client.inetAddress
    runCatching {
      listener(
        mapOf(
          "client" to (from?.hostAddress ?: ""),
          "fromReceiver" to (receiver == null || receiver == from),
          "method" to method,
          "key" to (key?.take(8) ?: ""),
          "range" to range,
          "status" to served.status,
          "bytes" to served.bytes.toDouble(),
          "ms" to elapsedMs.toDouble(),
        ),
      )
    }
  }

  // ── Tokens ──────────────────────────────────────────────────────────────────

  private fun newToken(): String {
    val bytes = ByteArray(16)
    random.nextBytes(bytes)
    return bytes.joinToString("") { "%02x".format(it) }
  }

  private fun keyFor(sessionToken: String, id: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    digest.update(sessionToken.toByteArray())
    digest.update(0.toByte())
    digest.update(id.toByteArray())
    return digest.digest().take(16).joinToString("") { "%02x".format(it) }
  }

  private val TOKEN_SHAPE = Regex("^[0-9a-f]{32}$")
  private val KEY_SHAPE = Regex("^[0-9a-f]{32}$")
  private val EXT_SHAPE = Regex("^[a-z0-9]{1,5}$")
}
