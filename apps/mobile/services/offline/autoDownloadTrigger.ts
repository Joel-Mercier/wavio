// Lets a like, an unlike or a playlist edit ask the automatic downloads to
// re-list the server without importing the service (and its network and store
// subscriptions) into every mutation hook. The service registers itself.
let handler: (() => void) | null = null;

export function setAutoDownloadSyncHandler(next: (() => void) | null): void {
  handler = next;
}

export function requestAutoDownloadSync(): void {
  handler?.();
}
