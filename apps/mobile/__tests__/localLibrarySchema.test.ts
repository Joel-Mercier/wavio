import { readFileSync } from "node:fs";
import { join } from "node:path";

// `tracks_resolved` is the one place every local-library read goes through, and
// it is a string. Nothing else in this suite touches real SQLite — expo-sqlite is
// mocked everywhere — so a column reference in the view that no table declares
// compiles, ships, and only fails on device, on the first query after a
// migration. (SQLite doesn't resolve a view's body at CREATE time either, so it
// wouldn't even fail loudly at migration.)
//
// This reads the schema back out of db.ts and checks the view against it. It is
// deliberately a parse rather than a query: it needs no sqlite binding, and the
// mistake it catches is always a name, never a semantic.

const source = readFileSync(join(__dirname, "../services/local/db.ts"), "utf8");

/** Every `CREATE TABLE` in the file, as table name -> declared columns. */
function declaredTables(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const re =
    /CREATE\s+(?:VIRTUAL\s+)?TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s*(?:USING\s+\w+)?\s*\(([\s\S]*?)\n\);/g;
  for (const [, name, body] of source.matchAll(re)) {
    const columns = new Set<string>();
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("--")) continue;
      const column = trimmed.match(/^(\w+)/)?.[1];
      if (!column) continue;
      // Table-level constraints, not columns.
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i.test(column)) continue;
      columns.add(column);
    }
    tables.set(name, columns);
  }
  // Columns added to an existing table after it shipped never appear in a
  // CREATE TABLE — they are ALTERed in on every open.
  for (const [, table, column] of source.matchAll(
    /ensureColumn\(\s*db,\s*"(\w+)",\s*"(\w+)"/g,
  )) {
    tables.get(table)?.add(column);
  }
  return tables;
}

const viewBody = (): string => {
  const body = source.match(/CREATE VIEW tracks_resolved AS([\s\S]*?);\n/)?.[1];
  if (!body) throw new Error("tracks_resolved view not found in db.ts");
  return body;
};

describe("tracks_resolved", () => {
  it("only reads columns its tables actually declare", () => {
    const tables = declaredTables();
    const body = viewBody();

    // `FROM tracks t` / `LEFT JOIN folder_art fa ON …`
    const aliases = new Map<string, string>();
    for (const [, table, alias] of body.matchAll(
      /(?:FROM|JOIN)\s+(\w+)\s+(\w+)/g,
    )) {
      aliases.set(alias, table);
    }
    expect(aliases.size).toBeGreaterThan(1);

    const missing: string[] = [];
    for (const [, alias, column] of body.matchAll(/\b(\w+)\.(\w+)\b/g)) {
      const table = aliases.get(alias);
      if (!table) continue;
      const columns = tables.get(table);
      expect(columns).toBeDefined();
      if (!columns?.has(column)) missing.push(`${table}.${column}`);
    }
    expect(missing).toEqual([]);
  });

  it("resolves artwork sidecar-over-embedded, with a correction above both", () => {
    // The order is the feature (issue #157), and it is expressed only in this
    // COALESCE — so pin the order rather than just the column list.
    const artwork = viewBody()
      .split("\n")
      .find((line) => line.includes("AS artwork_path"));
    expect(artwork).toContain(
      "COALESCE(o.artwork_path, fa.artwork_path, t.artwork_path)",
    );
  });
});
