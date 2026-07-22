import axios from "axios";
import * as Application from "expo-application";
import type { GithubRelease } from "@/services/appUpdate/types";
import { reportError } from "@/services/errorReporting";

// The repository whose releases drive the in-app updater.
const REPO = "Joel-Mercier/wavio";

const githubApi = axios.create({
  baseURL: "https://api.github.com",
  timeout: 10000,
  headers: {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `Wavio/${Application.nativeApplicationVersion ?? "0.0.0"}`,
  },
});

// Fetches the latest published (non-draft, non-prerelease) release. Returns null
// for a "no applicable release" outcome (repo has no releases → 404, or a shape
// we don't recognise). A real failure (offline, network blip, rate-limited)
// THROWS so the caller can tell "up to date" apart from "couldn't check" — and,
// crucially, so a transient blip on the launch auto-check isn't recorded as a
// successful check that then suppresses the retry for hours.
export async function fetchLatestRelease(): Promise<GithubRelease | null> {
  try {
    const { data } = await githubApi.get<GithubRelease>(
      `/repos/${REPO}/releases/latest`,
    );
    if (!data || typeof data.tag_name !== "string") return null;
    if (data.draft || data.prerelease) return null;
    return data;
  } catch (error) {
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    reportError(error, {
      area: "api",
      api: "github",
      endpoint: `/repos/${REPO}/releases/latest`,
      status,
      notFoundIsExpected: true,
    });
    // No published releases yet — a legitimate "nothing to update to".
    if (status === 404) return null;
    throw error;
  }
}

export const releasesPageUrl = `https://github.com/${REPO}/releases`;
