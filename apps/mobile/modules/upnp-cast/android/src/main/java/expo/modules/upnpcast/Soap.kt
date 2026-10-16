package expo.modules.upnpcast

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/** The UPnP/Sonos service types this module speaks. */
object Services {
  const val AV_TRANSPORT = "urn:schemas-upnp-org:service:AVTransport:1"
  const val RENDERING_CONTROL = "urn:schemas-upnp-org:service:RenderingControl:1"
  const val ZONE_GROUP_TOPOLOGY = "urn:schemas-upnp-org:service:ZoneGroupTopology:1"
  const val DEVICE_PROPERTIES = "urn:schemas-upnp-org:service:DeviceProperties:1"
}

object Soap {
  const val TAG = "UpnpCast"

  data class Result(
    val body: String?,
    val fault: String?
  ) {
    val ok: Boolean
      get() = body != null

    val refused: Boolean
      get() = body == null && fault != null

    val errorCode: Int?
      get() = fault
        ?.let { ERROR_CODE.find(it)?.groupValues?.get(1)?.toIntOrNull() }
  }

  suspend fun call(
    controlUrl: String,
    service: String,
    action: String,
    arguments: String = "",
    timeoutMs: Int = TIMEOUT_MS
  ): Result = withContext(Dispatchers.IO) {
    val envelope = buildString {
      append("<?xml version=\"1.0\" encoding=\"utf-8\"?>")
      append("<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" ")
      append("s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">")
      append("<s:Body><u:")
        .append(action)
        .append(" xmlns:u=\"")
        .append(service)
        .append("\">")
      append(arguments)
      append("</u:")
        .append(action)
        .append("></s:Body></s:Envelope>")
    }.toByteArray(Charsets.UTF_8)

    var connection: HttpURLConnection? = null

    try {
      connection = (URL(controlUrl).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"

        setRequestProperty(
          "Content-Type",
          "text/xml; charset=\"utf-8\""
        )

        setRequestProperty(
          "SOAPAction",
          "\"$service#$action\""
        )

        setRequestProperty(
          "Connection",
          "close"
        )

        connectTimeout = timeoutMs
        readTimeout = timeoutMs
        doOutput = true

        setFixedLengthStreamingMode(envelope.size)
      }

      connection.outputStream.use {
        it.write(envelope)
      }

      if (connection.responseCode == HttpURLConnection.HTTP_OK) {
        Result(
          connection.inputStream
            .bufferedReader()
            .use { it.readText() },
          null
        )
      } else {
        val fault = runCatching {
          connection.errorStream
            ?.bufferedReader()
            ?.use { it.readText() }
        }.getOrNull() ?: ""

        Log.w(
          TAG,
          "$action refused (${connection.responseCode}): " +
            fault.take(FAULT_LOG_CHARS)
        )

        Result(
          null,
          fault
        )
      }
    } catch (e: Exception) {
      Log.w(
        TAG,
        "$action failed: ${e.javaClass.simpleName}: ${e.message}"
      )

      Result(
        null,
        null
      )
    } finally {
      connection?.disconnect()
    }
  }

  /** A GET that returns text, primarily for UPnP device descriptions. */
  suspend fun fetch(
    url: String,
    timeoutMs: Int = TIMEOUT_MS
  ): String? = withContext(Dispatchers.IO) {
    var connection: HttpURLConnection? = null

    try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = timeoutMs
        readTimeout = timeoutMs
      }

      if (connection.responseCode != HttpURLConnection.HTTP_OK) {
        null
      } else {
        connection.inputStream
          .bufferedReader()
          .use { it.readText() }
      }
    } catch (_: Exception) {
      null
    } finally {
      connection?.disconnect()
    }
  }

  /**
   * Returns the first element matching [name] from a SOAP response.
   *
   * Namespace prefixes are tolerated:
   *
   *   <CurrentZoneName>
   *   <ns:CurrentZoneName>
   */
  fun argument(
    body: String?,
    name: String
  ): String? {
    if (body == null) return null

    val open = Regex(
      "<(?:\\w+:)?${Regex.escape(name)}(?:\\s[^>]*)?>"
    ).find(body) ?: return null

    val start = open.range.last + 1

    val close = Regex(
      "</(?:\\w+:)?${Regex.escape(name)}\\s*>"
    ).find(body, start) ?: return null

    return unescape(
      body.substring(
        start,
        close.range.first
      )
    ).trim()
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
   * Undo one XML escaping layer.
   *
   * Order matters: &amp; must be last.
   */
  fun unescape(text: String): String = text
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&apos;", "'")
    .replace("&amp;", "&")

  const val TIMEOUT_MS = 5000

  const val POLL_TIMEOUT_MS = 2000

  const val SLOW_FETCH_TIMEOUT_MS = 10000

  private const val FAULT_LOG_CHARS = 400

  private val ERROR_CODE = Regex(
    "<(?:\\w+:)?errorCode>\\s*(\\d+)"
  )
}