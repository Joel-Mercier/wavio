/**
 * Refreshes the published/in-review version status for every distribution channel.
 *
 * Writes `apps/landing/src/data/store-status.json` and rewrites the marker-delimited
 * table in `README.md`. Run by `.github/workflows/store-status.yml`.
 *
 * Takes an already-minted OAuth access token: the workflow gets one from GitHub's OIDC token
 * via Workload Identity Federation, so no service-account key exists to leak.
 *
 * Usage:
 *   GOOGLE_PLAY_ACCESS_TOKEN=$(gcloud auth print-access-token \
 *     --impersonate-service-account=<sa> \
 *     --scopes=https://www.googleapis.com/auth/androidpublisher) \
 *     bun run store-status [--dry-run]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "com.jmercier.wavio";
const GITHUB_REPO = "Joel-Mercier/wavio";
const PLAY_TRACK = "production";

const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_NAME}`;
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

const MARKER_START = "<!-- store-status:start -->";
const MARKER_END = "<!-- store-status:end -->";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = resolve(repoRoot, "apps/landing/src/data/store-status.json");
const readmePath = resolve(repoRoot, "README.md");

/**
 * Lifecycle states that mean "submitted but not serving users yet". Everything else is
 * either live (`PUBLISHED`) or noise we don't surface (`DRAFT`, `NOT_APPROVED`).
 */
const PENDING_STATES = new Set([
  "RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW",
  "RELEASE_LIFECYCLE_STATE_IN_REVIEW",
  "RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED",
]);

type ReleaseSummary = {
  releaseName?: string;
  releaseLifecycleState?: string;
  activeArtifacts?: { versionCode?: string | number }[];
};

type Channel = { version: string; url: string };

type StoreStatus = {
  github: Channel;
  play: Channel;
  pending: { version: string; state: string } | null;
  checkedAt: string;
};

export function highestVersionCode(release: ReleaseSummary): number {
  const codes = (release.activeArtifacts ?? []).map((artifact) =>
    Number(artifact.versionCode ?? 0),
  );
  return codes.length ? Math.max(...codes) : 0;
}

/**
 * `releaseName` is free text (Play auto-fills it from versionName, but renders it as
 * "1.3.0 (42)" in some flows), so pull the semver out rather than trusting it wholesale.
 */
export function versionNameOf(release: ReleaseSummary): string {
  const name = release.releaseName?.trim() ?? "";
  const match = name.match(/\d+\.\d+\.\d+/);
  if (match) return match[0];
  console.warn(
    `Could not parse a version out of release name ${JSON.stringify(name)}; using it as-is`,
  );
  if (!name) throw new Error("Release has neither a parsable nor a raw name");
  return name;
}

export function pickLatest(
  releases: ReleaseSummary[],
  predicate: (state: string) => boolean,
): ReleaseSummary | undefined {
  return releases
    .filter((release) => predicate(release.releaseLifecycleState ?? ""))
    .sort((a, b) => highestVersionCode(b) - highestVersionCode(a))[0];
}

async function fetchPlayStatus(): Promise<
  Pick<StoreStatus, "play" | "pending">
> {
  const token = process.env.GOOGLE_PLAY_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GOOGLE_PLAY_ACCESS_TOKEN is not set");
  }
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/tracks/${PLAY_TRACK}/releases`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      `Play releases request failed (${response.status}): ${await response.text()}`,
    );
  }
  const { releases = [] } = (await response.json()) as {
    releases?: ReleaseSummary[];
  };

  const live = pickLatest(
    releases,
    (state) => state === "RELEASE_LIFECYCLE_STATE_PUBLISHED",
  );
  if (!live) {
    throw new Error(`No published release on the ${PLAY_TRACK} track`);
  }

  const pending = pickLatest(releases, (state) => PENDING_STATES.has(state));
  const isAhead =
    pending && highestVersionCode(pending) > highestVersionCode(live);

  return {
    play: { version: versionNameOf(live), url: PLAY_STORE_URL },
    pending:
      pending && isAhead
        ? {
            version: versionNameOf(pending),
            state: (pending.releaseLifecycleState ?? "").replace(
              "RELEASE_LIFECYCLE_STATE_",
              "",
            ),
          }
        : null,
  };
}

async function fetchGithubStatus(): Promise<Channel> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "wavio-store-status",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub releases request failed (${response.status}): ${await response.text()}`,
    );
  }
  const { tag_name } = (await response.json()) as { tag_name?: string };
  if (!tag_name) throw new Error("GitHub returned no tag_name");
  return { version: tag_name.replace(/^v/, ""), url: RELEASES_URL };
}

export function renderReadmeTable(status: StoreStatus): string {
  const rows = [
    `| [Google Play Store](${status.play.url}) | ${status.play.version} |`,
  ];
  if (status.pending) {
    rows.push(`| In review on Google Play | ${status.pending.version} |`);
  }
  rows.push(
    `| [GitHub releases](${status.github.url}) | ${status.github.version} |`,
  );
  return [
    MARKER_START,
    "| Channel | Latest version |",
    "| --- | --- |",
    ...rows,
    MARKER_END,
  ].join("\n");
}

export function replaceMarkedBlock(readme: string, block: string): string {
  const start = readme.indexOf(MARKER_START);
  const end = readme.indexOf(MARKER_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `README.md is missing the ${MARKER_START} / ${MARKER_END} markers`,
    );
  }
  return readme.slice(0, start) + block + readme.slice(end + MARKER_END.length);
}

/** `checkedAt` changes on every run, so compare everything else to decide whether to write. */
function isUnchanged(next: StoreStatus, previous: string): boolean {
  try {
    const { checkedAt: _next, ...nextRest } = next;
    const { checkedAt: _previous, ...previousRest } = JSON.parse(previous);
    return JSON.stringify(nextRest) === JSON.stringify(previousRest);
  } catch {
    return false;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const [github, play] = await Promise.all([
    fetchGithubStatus(),
    fetchPlayStatus(),
  ]);
  const status: StoreStatus = {
    github,
    ...play,
    checkedAt: new Date().toISOString(),
  };

  console.log(`GitHub      ${status.github.version}`);
  console.log(`Play Store  ${status.play.version}`);
  console.log(
    `In review   ${status.pending ? `${status.pending.version} (${status.pending.state})` : "—"}`,
  );

  const readme = readFileSync(readmePath, "utf8");
  const nextReadme = replaceMarkedBlock(readme, renderReadmeTable(status));
  const previousData = readFileSync(dataPath, "utf8");

  if (isUnchanged(status, previousData) && nextReadme === readme) {
    console.log("\nNothing changed.");
    return;
  }

  if (dryRun) {
    console.log("\n--dry-run, not writing. Would write:\n");
    console.log(renderReadmeTable(status));
    return;
  }

  writeFileSync(dataPath, `${JSON.stringify(status, null, 2)}\n`);
  writeFileSync(readmePath, nextReadme);
  console.log(
    "\nUpdated README.md and apps/landing/src/data/store-status.json",
  );
}

if (import.meta.main) {
  main().catch((error) => {
    // Bail without writing so a transient outage can never blank the README or the site.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
