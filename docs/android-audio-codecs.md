# Android software audio decoding

The `expo-audio@58.0.9` patch includes the pinned Maven Central artifact
`org.jellyfin.media3:media3-ffmpeg-decoder:1.9.0+1`. It is based on Media3 1.9.0
and runs alongside Expo Audio's Media3 1.9.1 patch release. Recheck binary
compatibility when upgrading Media3, Expo Audio, or this decoder.

Both single-track and playlist players enable extension renderers in `PREFER`
mode. Merely enabling decoder fallback does not add a decoder, and using `ON`
instead would still select vendor ALAC codecs that advertise support but fail
at runtime. The existing playback-error/server-transcode recovery remains.

ALAC in supported MP4/M4A containers now has a software decoding path for
device files, SMB/WebDAV, HTTP streams and existing raw downloads. Raw downloads
and prefetches are no longer automatically converted to lossy Opus based on
an unreliable bitrate heuristic.

The extension also includes FLAC, MP3, AAC, AC-3, E-AC-3, DTS, MLP, TrueHD,
mu-law and A-law decoders. This does not add demuxers: WMA/ASF, AIFF and arbitrary
files with an `.alac` extension are not guaranteed to work. Metadata extraction
and waveform generation still use separate Android platform APIs.

## Licensing

The Jellyfin decoder artifact is GPL-3.0 licensed, unlike Wavio's MIT sources.
This is a private APK build configuration, not a license-neutral dependency
change. Any redistribution of a combined APK must comply with the applicable
GPL terms, including corresponding source and notices. Upstream source and
build instructions: <https://github.com/jellyfin/jellyfin-androidx-media>.
For a differently licensed distribution, build and audit an LGPL-only FFmpeg
extension rather than substituting a binary without reviewing its license.

## Device acceptance checks

Check 16-bit and 24-bit ALAC M4A files, including low-bitrate recordings, and
AAC M4A, FLAC, MP3, Ogg/Vorbis, Opus and PCM WAV controls. Test local/SAF, HTTP,
SMB/WebDAV and previously downloaded originals with the server unavailable.
Verify audible output, seeking, pause/resume, background playback and switching
tracks on a device without a working platform ALAC decoder. JavaScript tests
and successful APK compilation alone cannot establish audible playback.
