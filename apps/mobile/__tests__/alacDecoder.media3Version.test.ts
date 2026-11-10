import fs from "node:fs";
import path from "node:path";

// Drift guard for modules/alac-decoder: its Java is copied from one Media3
// release and compiled against it, while expo-audio supplies Media3 at runtime.
// The two must name the same version, and the expo-audio patch must actually
// have landed (bun applies nothing, silently, when a patch key drifts).

const expoAudioAndroid = path.join(
  path.dirname(require.resolve("expo-audio/package.json")),
  "android",
);
const alacDecoderGradle = path.join(
  __dirname,
  "..",
  "modules",
  "alac-decoder",
  "android",
  "build.gradle",
);

function media3Version(gradleFile: string): string | undefined {
  return fs
    .readFileSync(gradleFile, "utf8")
    .match(/def androidxMedia3Version = "([^"]+)"/)?.[1];
}

describe("alac-decoder", () => {
  it("compiles against the Media3 version expo-audio ships", () => {
    const expoAudio = media3Version(
      path.join(expoAudioAndroid, "build.gradle"),
    );
    expect(expoAudio).toBeDefined();
    expect(media3Version(alacDecoderGradle)).toBe(expoAudio);
  });

  it("is wired into both expo-audio players by the patch", () => {
    const gradle = fs.readFileSync(
      path.join(expoAudioAndroid, "build.gradle"),
      "utf8",
    );
    expect(gradle).toContain("implementation project(':alac-decoder')");
    for (const player of ["AudioPlayer.kt", "AudioPlaylist.kt"]) {
      const source = fs.readFileSync(
        path.join(expoAudioAndroid, "src/main/java/expo/modules/audio", player),
        "utf8",
      );
      expect(source).toContain(
        ".setRenderersFactory(AlacRenderersFactory(context))",
      );
    }
  });
});
