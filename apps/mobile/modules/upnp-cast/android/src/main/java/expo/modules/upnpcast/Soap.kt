package expo.modules.upnpcast

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/** The UPnP AV service types this module speaks. */
object Services {
  const val AV_TRANSPORT = "urn:schemas-upnp-org:service:AVTransport:1"
  const val RENDERING_CONTROL = "urn:schemas-upnp-org:service:RenderingControl:1"
  const val ZONE_GROUP_TOPOLOGY = "urn:schemas-upnp-org:service:ZoneGroupTopology:1"
}

object Soap {
  const val TAG = "UpnpCast"

  /**
   * The outcome of an action.
   *
   * A refusal keeps its fault text because that is the only thing distinguishing the
   * two failures worth telling apart: a renderer that will not take this *format*
   * (retry with something else) from one that did not understand the *request* at
   * all (retry differently, or give up). Both arrive as an HTTP 500.
   */
  data class Result(val body: String?, val fault: String?) {
    val ok: Boolean get() = body != null
  }

  suspend fun call(
    controlUrl: String,
    service: String,
    action: String,
    arguments: String = ""
  ): Result = withContext(Dispatchers.IO) {
    val envelope = buildString {
      append("<?xml version=\"1.0\" encoding=\"utf-8\"?>")
      append("<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" ")
      append("s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">")
      append("<s:Body><u:").append(action).append(" xmlns:u=\"").append(service).append("\">")
      append(arguments)
      append("</u:").append(action).append("></s:Body></s:Envelope>")
    }.toByteArray(Charsets.UTF_8)

    var connection: HttpURLConnection? = null
    try {
      connection = (URL(controlUrl).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"")
        setRequestProperty("SOAPAction", "\"$service#$action\"")
        setRequestProperty("Connection", "close")
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        doOutput = true
        setFixedLengthStreamingMode(envelope.size)
      }
      connection.outputStream.use { it.write(envelope) }
      if (connection.responseCode == HttpURLConnection.HTTP_OK) {
        Result(connection.inputStream.bufferedReader().use { it.readText() }, null)
      } else {
        val fault = runCatching {
          connection.errorStream?.bufferedReader()?.use { it.readText() }
        }.getOrNull()
        Log.w(TAG, "$action refused (${connection.responseCode}): ${fault?.take(FAULT_LOG_CHARS)}")
        Result(null, fault)
      }
    } catch (e: Exception) {
      Log.w(TAG, "$action failed: ${e.javaClass.simpleName}: ${e.message}")
      Result(null, null)
    } finally {
      connection?.disconnect()
    }
  }

  /** A GET that returns text, for device descriptions. */
  suspend fun fetch(url: String): String? = withContext(Dispatchers.IO) {
    var connection: HttpURLConnection? = null
    try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
      }
      if (connection.responseCode != HttpURLConnection.HTTP_OK) null
      else connection.inputStream.bufferedReader().use { it.readText() }
    } catch (_: Exception) {
      null
    } finally {
      connection?.disconnect()
    }
  }

  /**
   * The text of the first element with this name, from a SOAP response.
   *
   * Responses are flat argument lists, so finding an element by name needs no
   * awareness of structure — unlike a device description, which is parsed properly.
   */
  fun argument(body: String?, name: String): String? {
    if (body == null) return null
    val open = Regex("<$name[^>]*>").find(body) ?: return null
    val start = open.range.last + 1
    val end = body.indexOf("</$name>", start)
    if (end < 0) return null
    return unescape(body.substring(start, end)).trim()
  }

  fun escape(text: String): String = buildString(text.length) {
    for (c in text) {
      when (c) {
        '&' -> append("&amp;")
        '<' -> append("&lt;")
        '>' -> append("&gt;")
        '"' -> append("&quot;")
        '\'' -> append("&apos;")
        else -> append(c)
      }
    }
  }

  /**
   * Undoes one layer of escaping. Order matters: `&amp;` last, or `&amp;lt;` — a
   * literal "&lt;" that a device meant as text — would come out as a tag.
   */
  fun unescape(text: String): String = text
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&apos;", "'")
    .replace("&amp;", "&")

  private const val TIMEOUT_MS = 5000
  private const val FAULT_LOG_CHARS = 400
}
