import * as Application from "expo-application";
import * as StoreReview from "expo-store-review";
import { AppState, Platform } from "react-native";
import { isStoreDistribution } from "@/config/distribution";
import { getNoBackupStorage } from "@/config/storage";
import { CarAutoBridge } from "@/services/carAuto/bridge";
import { getIsEffectivelyOnline } from "@/services/network";
import { activeRemoteTarget } from "@/services/playback/remoteTarget";
import { useAuthBase } from "@/stores/auth";
import usePlaybackNotice from "@/stores/playbackNotice";

// Play never says whether the card was shown, so every request counts as an
// attempt. Kept device-wide (a server switch must not re-arm it) and out of
// Android Auto Backup (a restored phone must not inherit "already asked").

const STORAGE_KEY = "reviewPrompt";

const MIN_INSTALL_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ACTIVE_DAYS = 5;
const MIN_COUNTED_PLAYS = 30;
const COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const SETTLE_DELAY_MS = 1500;
const MAX_SETTLE_MS = 3000;

export type ReviewPromptState = {
  countedPlays: number;
  activeDays: number;
  lastActiveDay: string | null;
  attempts: number;
  lastAttemptAt: number | null;
};

const INITIAL_STATE: ReviewPromptState = {
  countedPlays: 0,
  activeDays: 0,
  lastActiveDay: null,
  attempts: 0,
  lastAttemptAt: null,
};

const supported = isStoreDistribution && Platform.OS === "android";

let requestedThisSession = false;
let troubledThisSession = false;
let updateOfferedThisSession = false;
let pending = false;

usePlaybackNotice.subscribe((state) => {
  if (state.notice) troubledThisSession = true;
});

export function readReviewPromptState(): ReviewPromptState {
  const raw = getNoBackupStorage(STORAGE_KEY).getString(STORAGE_KEY);
  if (!raw) return INITIAL_STATE;
  try {
    return { ...INITIAL_STATE, ...JSON.parse(raw) };
  } catch {
    return INITIAL_STATE;
  }
}

function writeState(state: ReviewPromptState) {
  getNoBackupStorage(STORAGE_KEY).set(STORAGE_KEY, JSON.stringify(state));
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function noteCountedPlay() {
  if (!supported) return;
  const state = readReviewPromptState();
  if (state.attempts >= MAX_ATTEMPTS) return;
  const today = dayKey(new Date());
  writeState({
    ...state,
    countedPlays: state.countedPlays + 1,
    activeDays:
      state.lastActiveDay === today ? state.activeDays : state.activeDays + 1,
    lastActiveDay: today,
  });
}

export function noteUpdateOffered() {
  updateOfferedThisSession = true;
}

function isEngaged(state: ReviewPromptState, now: number): boolean {
  if (state.attempts >= MAX_ATTEMPTS) return false;
  if (state.lastAttemptAt != null && now - state.lastAttemptAt < COOLDOWN_MS) {
    return false;
  }
  return (
    state.countedPlays >= MIN_COUNTED_PLAYS &&
    state.activeDays >= MIN_ACTIVE_DAYS
  );
}

function isGoodMoment(): boolean {
  return (
    AppState.currentState === "active" &&
    useAuthBase.getState().isAuthenticated &&
    getIsEffectivelyOnline() &&
    !CarAutoBridge.isCarConnected() &&
    activeRemoteTarget() == null &&
    !troubledThisSession &&
    !updateOfferedThisSession
  );
}

async function installedLongEnough(now: number): Promise<boolean> {
  try {
    const installedAt = await Application.getInstallationTimeAsync();
    return now - installedAt.getTime() >= MIN_INSTALL_AGE_MS;
  } catch {
    return false;
  }
}

export async function maybeRequestReview(): Promise<void> {
  if (!supported || requestedThisSession || pending) return;
  if (!isGoodMoment()) return;
  if (!isEngaged(readReviewPromptState(), Date.now())) return;

  pending = true;
  try {
    if (!(await installedLongEnough(Date.now()))) return;
    if (!(await StoreReview.isAvailableAsync())) return;
    const settleStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));
    // JS timers pause in the background, so a late wake-up means the user left.
    if (Date.now() - settleStartedAt > MAX_SETTLE_MS) return;
    if (!isGoodMoment()) return;

    const state = readReviewPromptState();
    if (!isEngaged(state, Date.now())) return;
    requestedThisSession = true;
    writeState({
      ...state,
      countedPlays: 0,
      activeDays: 0,
      lastActiveDay: null,
      attempts: state.attempts + 1,
      lastAttemptAt: Date.now(),
    });
    await StoreReview.requestReview();
  } catch {
    // Play's quota or flow errors aren't actionable; the attempt is recorded.
  } finally {
    pending = false;
  }
}

export function __resetReviewPromptSession() {
  requestedThisSession = false;
  troubledThisSession = false;
  updateOfferedThisSession = false;
  pending = false;
}
