// The downloader picker lives once at the app root (see DownloaderPickerSheet,
// mounted in app/(app)/_layout). This tiny controller lets any screen open it
// without prop-drilling a ref, mirroring jukeboxSheetController.
let opener: ((query: string) => void) | null = null;

export function setDownloaderPickerOpener(
  open: ((query: string) => void) | null,
) {
  opener = open;
}

export function openDownloaderPicker(query: string) {
  opener?.(query);
}
