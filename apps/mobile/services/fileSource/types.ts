// Where a library's bytes come from.
//
// Everything above this seam — the indexer, the SQLite index, and every read
// path in services/local/* — is identical whether the files sit on this phone's
// storage or on a NAS. Only four operations differ: listing a directory, reading
// a byte range, turning a file into something a player can open, and asking
// whether the source is reachable at all. This is that interface.
//
// Addresses are **canonical URIs owned by the source**: `file:///…` or
// `content://…` for the device, `webdav:/Music/a.flac` / `smb:/Music/a.flac`
// for a network share. The same string is what lands in `tracks.uri` and what
// `services/local/keys.ts` encodes into a track id, so it must never carry
// credentials — those are resolved at play time from the active server.
// Network addresses are deliberately source-*relative* (no host): the DB is
// scoped per server, so the host is constant within it, and a share whose LAN
// address changes must not invalidate every id in the index.

export type FileSourceKind = "device" | "webdav" | "smb";

export type RemoteEntry = {
  name: string;
  isDirectory: boolean;
  /** Bytes, 0 when the source can't report one. */
  size: number;
  /** Epoch ms, 0 when the source can't report one. */
  mtime: number;
  /** Canonical URI for this entry — the index key and the source's address. */
  path: string;
};

/**
 * Random-access read over one file. Held open for the duration of a read
 * session so the device source keeps a single file handle and an HTTP source
 * can keep a connection warm, rather than paying per range.
 */
export type ByteReader = {
  /** Reads up to `length` bytes at `offset`; may return fewer at EOF. */
  read(offset: number, length: number): Promise<Uint8Array>;
  close(): void;
};

export interface FileSource {
  readonly kind: FileSourceKind;
  /**
   * Files extracted in parallel during a scan. Device extraction is native I/O
   * plus a JS raw-tag read, so a small pool overlaps the two; a network source
   * is latency-bound and wants a much larger one.
   */
  readonly extractConcurrency: number;
  /** Canonical form for a user-configured root (e.g. adds the file:// scheme). */
  normalizeRoot(root: string): string;
  exists(path: string): Promise<boolean>;
  /** Entries directly under `path`. Throws if `path` isn't listable. */
  list(path: string): Promise<RemoteEntry[]>;
  openReader(path: string): Promise<ByteReader>;
  /**
   * A URL any consumer on this device can open — the player, the native
   * metadata reader, the waveform analyser, the offline downloader.
   *
   * **Synchronous by contract**: `streamUrl` in services/backend/streaming.ts is
   * called during a track change and cannot yield. A source that needs a
   * running loopback bridge must therefore have started it beforehand and cache
   * its port (see resolveServerBase in modules/ssl-trust).
   */
  playableUrl(path: string): string;
  probe(): Promise<boolean>;
}
