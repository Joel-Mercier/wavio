import { Directory, File, Paths } from "expo-file-system";
import type {
  DownloadProgressHandler,
  GithubReleaseAsset,
} from "@/services/appUpdate/types";

// Downloads the release APK into the cache under a stable name and returns the
// local file. Progress is reported as a 0..1 fraction (skipped when the server
// omits Content-Length). The finished file's size is checked against the asset's
// advertised size to catch a truncated/interrupted download; a partial file is
// deleted so a retry starts clean. Integrity/authenticity beyond size is left to
// TLS (HTTPS from GitHub) and Android's own APK signature verification at
// install time — a wrongly-signed APK fails to install regardless.
export async function downloadApk(
  asset: GithubReleaseAsset,
  onProgress?: DownloadProgressHandler,
  signal?: AbortSignal,
): Promise<File> {
  const dir = new Directory(Paths.cache, "Updates");
  dir.create({ idempotent: true, intermediates: true });

  const target = new File(dir, asset.name);
  if (target.exists) target.delete();

  try {
    const file = await File.downloadFileAsync(
      asset.browser_download_url,
      target,
      {
        idempotent: true,
        signal,
        onProgress: onProgress
          ? ({ bytesWritten, totalBytes }) => {
              if (totalBytes > 0) {
                onProgress(Math.min(1, bytesWritten / totalBytes));
              }
            }
          : undefined,
      },
    );

    if (!file.exists || (asset.size > 0 && file.size !== asset.size)) {
      if (file.exists) file.delete();
      throw new Error("Downloaded APK is incomplete");
    }
    return file;
  } catch (error) {
    if (target.exists) target.delete();
    throw error;
  }
}
