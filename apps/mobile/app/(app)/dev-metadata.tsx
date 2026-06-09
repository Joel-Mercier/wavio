import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  type AudioMetadata,
  getAudioMetadata,
  isAudioMetadataAvailable,
} from "@/modules/audio-metadata";

// Dev-only harness to exercise the `audio-metadata` native module: point it at a
// directory (or pick files) and inspect what we can extract from each track.
// Reach it with `router.push("/dev-metadata")` from anywhere while developing.

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "opus",
  "wav",
  "wma",
  "aiff",
  "aif",
  "alac",
]);

type Row = {
  uri: string;
  name: string;
  size?: number;
  metadata?: AudioMetadata;
  error?: string;
};

const isAudioFile = (name: string) =>
  AUDIO_EXTENSIONS.has(name.split(".").pop()?.toLowerCase() ?? "");

async function requestAndroidAudioPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const permission =
    Platform.Version >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
  const status = await PermissionsAndroid.request(permission);
  return status === PermissionsAndroid.RESULTS.GRANTED;
}

export default function DevMetadataScreen() {
  const [path, setPath] = useState(
    Platform.OS === "android" ? "/storage/emulated/0/Music" : "",
  );
  const [includeArtwork, setIncludeArtwork] = useState(true);
  const [artworkToFile, setArtworkToFile] = useState(false);
  const [enrich, setEnrich] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const extractAll = async (
    files: { uri: string; name: string; size?: number }[],
  ) => {
    setBusy(true);
    // When testing file mode, drop artwork into a dedicated cache subdir.
    const artworkDir = artworkToFile
      ? new Directory(Paths.cache, "dev-artwork").uri
      : undefined;
    const next: Row[] = [];
    for (const file of files) {
      try {
        const metadata = await getAudioMetadata(file.uri, {
          includeArtwork,
          artworkDir,
          enrich,
        });
        next.push({ ...file, metadata });
      } catch (e) {
        next.push({ ...file, error: String(e) });
      }
      // Stream results in so progress is visible on large folders.
      setRows([...next]);
    }
    setBusy(false);
    setStatus(`${next.length} file(s) processed`);
  };

  const scanDirectory = async () => {
    setRows([]);
    setStatus("");
    if (!isAudioMetadataAvailable()) {
      setStatus("Native module unavailable — run a prebuild + native rebuild.");
      return;
    }
    const granted = await requestAndroidAudioPermission();
    if (!granted) {
      setStatus("Audio read permission denied.");
      return;
    }
    try {
      const normalized = path.startsWith("file://") ? path : `file://${path}`;
      const dir = new Directory(normalized);
      if (!dir.exists) {
        setStatus(`Directory does not exist: ${path}`);
        return;
      }
      const files = dir
        .list()
        .filter((e): e is File => e instanceof File && isAudioFile(e.name))
        .map((f) => ({ uri: f.uri, name: f.name, size: f.size ?? undefined }));
      if (files.length === 0) {
        setStatus("No audio files found in that directory.");
        return;
      }
      setStatus(`Found ${files.length} file(s), extracting…`);
      await extractAll(files);
    } catch (e) {
      setStatus(`Scan failed: ${String(e)}`);
    }
  };

  const pickFiles = async () => {
    setRows([]);
    setStatus("");
    if (!isAudioMetadataAvailable()) {
      setStatus("Native module unavailable — run a prebuild + native rebuild.");
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const files = res.assets.map((a) => ({
      uri: a.uri,
      name: a.name,
      size: a.size ?? undefined,
    }));
    setStatus(`Picked ${files.length} file(s), extracting…`);
    await extractAll(files);
  };

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: "Audio metadata (dev)" }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: "#000" }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: "#999", fontSize: 12 }}>
          Extracts tags via the native `audio-metadata` module. Scan a folder
          path, or pick files (always works, copies into the app sandbox).
        </Text>

        <TextInput
          value={path}
          onChangeText={setPath}
          placeholder="/storage/emulated/0/Music"
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            color: "#fff",
            borderColor: "#333",
            borderWidth: 1,
            borderRadius: 8,
            padding: 12,
          }}
        />

        <Checkbox
          label="Load embedded artwork"
          checked={includeArtwork}
          onToggle={() => setIncludeArtwork((v) => !v)}
        />
        <Checkbox
          label="Artwork → file (content-hashed, vs inline base64)"
          checked={artworkToFile}
          onToggle={() => setArtworkToFile((v) => !v)}
        />
        <Checkbox
          label="Enrich (raw ID3/FLAC frames: ReplayGain, lyrics, artists, MBID)"
          checked={enrich}
          onToggle={() => setEnrich((v) => !v)}
        />

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button
            label="Scan directory"
            onPress={scanDirectory}
            disabled={busy}
          />
          <Button label="Pick files" onPress={pickFiles} disabled={busy} />
        </View>

        {status ? (
          <Text style={{ color: "#fbbf24", fontSize: 13 }}>{status}</Text>
        ) : null}

        {rows.map((row) => (
          <ResultCard key={row.uri} row={row} />
        ))}
      </ScrollView>
    </>
  );
}

function Checkbox({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: "#555",
          backgroundColor: checked ? "#4ade80" : "transparent",
        }}
      />
      <Text style={{ color: "#fff", flex: 1 }}>{label}</Text>
    </Pressable>
  );
}

function Button({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        backgroundColor: disabled ? "#1f2937" : "#2563eb",
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

function ResultCard({ row }: { row: Row }) {
  const m = row.metadata;
  return (
    <View
      style={{
        borderColor: "#222",
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        gap: 8,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{row.name}</Text>
      {row.error ? (
        <Text style={{ color: "#f87171", fontSize: 12 }}>{row.error}</Text>
      ) : m ? (
        <View style={{ flexDirection: "row", gap: 12 }}>
          {m.artworkPath ? (
            <Image
              source={{ uri: m.artworkPath }}
              style={{ width: 72, height: 72, borderRadius: 6 }}
            />
          ) : m.artworkBase64 ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${m.artworkBase64}` }}
              style={{ width: 72, height: 72, borderRadius: 6 }}
            />
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Field label="title" value={m.title} />
            <Field label="artist" value={m.artist} />
            <Field label="album" value={m.album} />
            <Field label="albumArtist" value={m.albumArtist} />
            <Field label="composer" value={m.composer} />
            <Field label="genre" value={m.genre} />
            <Field label="year" value={m.year} />
            <Field
              label="track"
              value={
                m.trackNumber &&
                `${m.trackNumber}${m.trackTotal ? `/${m.trackTotal}` : ""}`
              }
            />
            <Field
              label="disc"
              value={
                m.discNumber &&
                `${m.discNumber}${m.discTotal ? `/${m.discTotal}` : ""}`
              }
            />
            <Field
              label="duration"
              value={m.durationMs && `${Math.round(m.durationMs / 1000)}s`}
            />
            <Field
              label="bitrate"
              value={m.bitrate && `${Math.round(m.bitrate / 1000)} kbps`}
            />
            <Field label="sampleRate" value={m.sampleRate} />
            <Field
              label="compilation"
              value={m.isCompilation ? "yes" : undefined}
            />
            <Field
              label="artwork"
              value={
                m.artworkPath
                  ? `file (${m.artworkMimeType ?? "?"})`
                  : m.artworkBase64
                    ? "base64"
                    : "none"
              }
            />
            <Field label="artworkPath" value={m.artworkPath} />
            {m.artists && m.artists.length > 1 ? (
              <Field label="artists" value={m.artists.join(", ")} />
            ) : null}
            <Field label="musicBrainzId" value={m.musicBrainzId} />
            {m.replayGain ? (
              <Field
                label="replayGain"
                value={formatReplayGain(m.replayGain)}
              />
            ) : null}
            {m.lyrics ? (
              <Field
                label="lyrics"
                value={`${m.lyrics.length} chars — ${m.lyrics
                  .replace(/\s+/g, " ")
                  .slice(0, 60)}…`}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function formatReplayGain(
  rg: NonNullable<AudioMetadata["replayGain"]>,
): string {
  const parts: string[] = [];
  if (rg.trackGain !== undefined) parts.push(`track ${rg.trackGain}dB`);
  if (rg.albumGain !== undefined) parts.push(`album ${rg.albumGain}dB`);
  if (rg.trackPeak !== undefined) parts.push(`tpeak ${rg.trackPeak}`);
  if (rg.albumPeak !== undefined) parts.push(`apeak ${rg.albumPeak}`);
  return parts.join("  ");
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | number | false;
}) {
  if (value === undefined || value === false || value === "") return null;
  return (
    <Text style={{ color: "#cbd5e1", fontSize: 12 }}>
      <Text style={{ color: "#64748b" }}>{label}: </Text>
      {String(value)}
    </Text>
  );
}
