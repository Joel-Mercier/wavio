package expo.modules.smb

import com.hierynomus.mserref.NtStatus
import com.hierynomus.msdtyp.AccessMask
import com.hierynomus.mssmb2.SMB2CreateDisposition
import com.hierynomus.mssmb2.SMB2ShareAccess
import com.hierynomus.mssmb2.SMBApiException
import com.hierynomus.smbj.SMBClient
import com.hierynomus.smbj.SmbConfig
import com.hierynomus.smbj.auth.AuthenticationContext
import com.hierynomus.smbj.connection.Connection
import com.hierynomus.smbj.session.Session
import com.hierynomus.smbj.share.DiskShare
import com.hierynomus.smbj.share.File as SmbFile
import java.util.EnumSet
import java.util.concurrent.TimeUnit

/**
 * One cached SMB session, shared by every caller.
 *
 * A share is expensive to set up (TCP connect, dialect negotiation, NTLM) and
 * cheap to keep, and a scan plus playback will hit it from several threads at
 * once. smbj handles concurrent operations on one connection, so only
 * (re)connecting is serialized here; each operation opens its own file handle.
 *
 * Paths arrive share-relative with forward slashes (`/Music/a.flac`); smbj's
 * `SmbPath.rewritePath` converts them to the wire's backslashes and drops the
 * leading one, so they are passed through untouched.
 */
internal object SmbConnection {
  private val lock = Any()

  private var key: String? = null
  private var client: SMBClient? = null
  private var connection: Connection? = null
  private var session: Session? = null
  private var share: DiskShare? = null

  /**
   * Runs [block] against the target's share, reconnecting once if the cached
   * connection turns out to be dead.
   *
   * A protocol-level answer (`SMBApiException`) is *not* retried: the server
   * replied, so the connection is fine and the answer won't change. Anything else
   * is the transport, which a NAS drops freely — after a sleep, a Wi-Fi roam, or
   * its own idle timeout — and that is worth exactly one more attempt.
   */
  fun <T> withShare(target: SmbTarget, timeoutMs: Long, block: (DiskShare) -> T): T {
    try {
      return block(shareFor(target, timeoutMs))
    } catch (e: SMBApiException) {
      throw translate(e)
    } catch (e: SmbFailure) {
      throw e
    } catch (_: Exception) {
      reset()
    }
    try {
      return block(shareFor(target, timeoutMs))
    } catch (e: SMBApiException) {
      throw translate(e)
    } catch (e: SmbFailure) {
      throw e
    } catch (e: Exception) {
      reset()
      throw SmbUnreachableException(describe(target, e))
    }
  }

  /**
   * Opens a file for reading. The handle outlives `withShare`, because the bridge
   * streams a response body from it — a mid-stream transport failure can't be
   * retried anyway (the HTTP status is already sent), so it just closes the
   * socket, and the caller's next request heals the connection through the retry
   * above.
   */
  fun openForRead(target: SmbTarget, path: String, timeoutMs: Long): SmbFile =
    withShare(target, timeoutMs) { share ->
      share.openFile(
        path,
        EnumSet.of(AccessMask.GENERIC_READ),
        null,
        SMB2ShareAccess.ALL,
        SMB2CreateDisposition.FILE_OPEN,
        null,
      )
    }

  fun reset() {
    synchronized(lock) { closeLocked() }
  }

  private fun shareFor(target: SmbTarget, timeoutMs: Long): DiskShare {
    synchronized(lock) {
      val cached = share
      if (cached != null && key == target.key && connection?.isConnected == true) {
        return cached
      }
      closeLocked()
      return connect(target, timeoutMs)
    }
  }

  private fun connect(target: SmbTarget, timeoutMs: Long): DiskShare {
    val config = SmbConfig.builder()
      .withTimeout(timeoutMs, TimeUnit.MILLISECONDS)
      .withSoTimeout(timeoutMs * 2, TimeUnit.MILLISECONDS)
      .build()
    val newClient = SMBClient(config)
    try {
      val newConnection = newClient.connect(target.host, target.port)
      val newSession = newConnection.authenticate(
        AuthenticationContext(
          target.username,
          target.password.toCharArray(),
          target.domain.ifBlank { null },
        ),
      )
      val connected = newSession.connectShare(target.share)
      if (connected !is DiskShare) {
        connected.close()
        throw SmbNoShareException(
          "\"${target.share}\" on ${target.host} is not a file share",
        )
      }
      client = newClient
      connection = newConnection
      session = newSession
      share = connected
      key = target.key
      return connected
    } catch (e: SMBApiException) {
      runCatching { newClient.close() }
      throw translate(e)
    } catch (e: SmbFailure) {
      runCatching { newClient.close() }
      throw e
    } catch (e: Exception) {
      runCatching { newClient.close() }
      throw SmbUnreachableException(describe(target, e))
    }
  }

  private fun closeLocked() {
    runCatching { share?.close() }
    runCatching { session?.close() }
    runCatching { connection?.close() }
    runCatching { client?.close() }
    share = null
    session = null
    connection = null
    client = null
    key = null
  }

  /**
   * Which of the three things the user got wrong. Everything unrecognized falls
   * to "unreachable", whose copy tells them to check the address and the SMB
   * version — the right advice for a server doing something we don't understand.
   */
  private fun translate(e: SMBApiException): SmbFailure = when (e.status) {
    NtStatus.STATUS_LOGON_FAILURE,
    NtStatus.STATUS_ACCESS_DENIED,
    NtStatus.STATUS_ACCOUNT_DISABLED,
    NtStatus.STATUS_PASSWORD_EXPIRED,
    NtStatus.STATUS_LOGON_TYPE_NOT_GRANTED,
    -> SmbAuthException(e.message ?: "SMB authentication failed")

    NtStatus.STATUS_BAD_NETWORK_NAME,
    NtStatus.STATUS_BAD_NETWORK_PATH,
    -> SmbNoShareException(e.message ?: "No such SMB share")

    NtStatus.STATUS_OBJECT_NAME_NOT_FOUND,
    NtStatus.STATUS_OBJECT_PATH_NOT_FOUND,
    -> SmbPathException(e.message ?: "No such path on the share")

    else -> SmbUnreachableException(
      "${e.status}: ${e.message ?: "SMB request failed"}",
    )
  }

  private fun describe(target: SmbTarget, e: Exception): String =
    "${target.host}:${target.port} — ${e.javaClass.simpleName}: ${e.message}"
}
