import fs from "node:fs";
import path from "node:path";

// The index stays correct only because it is derived from the server's
// playlist listing, never patched by the code that edits playlists. A staleness
// bug is fixed in the index's own signature, re-verify or listing logic, not by
// teaching some mutation to write into it, so only these files may import it.
const ALLOWED = new Set([
  "services/backend/playlists.ts",
  "services/navidromeIdMigration/remap.ts",
  "stores/servers.ts",
]);

const root = path.join(__dirname, "..");
const SKIP = new Set(["node_modules", "__tests__", "android", "ios", ".expo"]);

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

it("is only imported where the listing-derived design allows", () => {
  const importers = sources(root)
    .map((file) => path.relative(root, file))
    .filter((file) => !file.startsWith("services/playlistArtistIndex/"))
    .filter((file) =>
      fs
        .readFileSync(path.join(root, file), "utf8")
        .includes("@/services/playlistArtistIndex"),
    );

  expect(importers).toContain("services/backend/playlists.ts");
  expect(importers.filter((file) => !ALLOWED.has(file))).toEqual([]);
});
