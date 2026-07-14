import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { downloadUrl } from "@/services/backend/streaming";
import { safeFileName } from "@/utils/safeFileName";

type SavableTrack = {
  id: string;
  title?: string;
  suffix?: string;
};

// Groups device-saved tracks under one media-library album, and — because
// passing an album to Asset.create overrides the MIME-derived directory — keeps
// untypeable audio formats out of the DCIM directory MediaStore rejects.
const DEVICE_ALBUM_NAME = "Wavio";

// Saves a track's audio file into the device's shared media library (system
// Music/Downloads), reachable from other apps. Remote tracks are fetched over
// HTTP; local-library tracks resolve to an on-device source instead — a
// `file://` URI or, for Android SAF folders, a `content://` URI — which can't
// be "downloaded", so we copy the bytes straight into the cache before handing
// the file to the media library. The cache copy carries the track title as its
// name so the saved asset isn't named after the opaque track id.
export async function saveTrackToDevice(track: SavableTrack): Promise<void> {
  const source = downloadUrl(track.id);
  const downloads = new Directory(Paths.cache, "Downloads");
  downloads.create({ idempotent: true, intermediates: true });

  const cacheFile = new File(
    downloads,
    safeFileName(track.title, track.suffix, track.id),
  );

  if (/^https?:\/\//i.test(source)) {
    const output = await File.downloadFileAsync(source, cacheFile, {
      idempotent: true,
    });
    if (!output.exists) {
      throw new Error("Download failed - file does not exist");
    }
  } else {
    if (cacheFile.exists) cacheFile.delete();
    await new File(source).copy(cacheFile, { overwrite: true });
  }

  try {
    // Create the asset inside a dedicated album. Passing an album makes
    // expo-media-library use the album's relative path instead of deriving the
    // directory from the file's MIME type — which for audio containers Android
    // can't type (e.g. m4a / opus, where `getType` and `MimeTypeMap` both return
    // null) otherwise defaults to DCIM and is rejected by MediaStore ("Primary
    // directory DCIM not allowed" for audio). Once the album exists, every save
    // (including untypeable formats) lands in its Music directory.
    const existing = await MediaLibrary.Album.get(DEVICE_ALBUM_NAME);
    if (existing) {
      await MediaLibrary.Asset.create(cacheFile.uri, existing);
    } else {
      await MediaLibrary.Album.create(
        DEVICE_ALBUM_NAME,
        [cacheFile.uri],
        false,
      );
    }
  } finally {
    if (cacheFile.exists) cacheFile.delete();
  }
}
