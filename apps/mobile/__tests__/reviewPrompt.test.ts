const mockMem = new Map<string, string>();
const mockCreateMMKV = jest.fn((_config: { id: string; path?: string }) => ({
  set: (k: string, v: string) => mockMem.set(k, v),
  getString: (k: string) => mockMem.get(k),
}));
jest.mock("react-native-mmkv", () => ({
  createMMKV: (config: { id: string; path?: string }) => mockCreateMMKV(config),
}));
jest.mock("expo-file-system", () => ({
  Paths: {
    document: {
      parentDirectory: { uri: "file:///data/user/0/com.jmercier.wavio/" },
    },
  },
}));

const mockDistribution = { isStoreDistribution: true };
jest.mock("@/config/distribution", () => ({
  get isStoreDistribution() {
    return mockDistribution.isStoreDistribution;
  },
}));

const mockRequestReview = jest.fn<Promise<void>, []>(() => Promise.resolve());
const mockIsAvailable = jest.fn(() => Promise.resolve(true));
jest.mock("expo-store-review", () => ({
  requestReview: () => mockRequestReview(),
  isAvailableAsync: () => mockIsAvailable(),
}));

const DAY = 24 * 60 * 60 * 1000;
let mockInstalledAt = 0;
jest.mock("expo-application", () => ({
  getInstallationTimeAsync: () => Promise.resolve(new Date(mockInstalledAt)),
}));

const mockEnv = {
  appState: "active",
  carConnected: false,
  remoteTarget: null as unknown,
  online: true,
  authenticated: true,
};
jest.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return mockEnv.appState;
    },
  },
  Platform: { OS: "android" },
}));
jest.mock("@/services/carAuto/bridge", () => ({
  CarAutoBridge: { isCarConnected: () => mockEnv.carConnected },
}));
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockEnv.online,
}));
jest.mock("@/services/playback/remoteTarget", () => ({
  activeRemoteTarget: () => mockEnv.remoteTarget,
}));
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ isAuthenticated: mockEnv.authenticated }),
  },
}));

import type * as ReviewPromptModule from "@/services/reviewPrompt";

type ReviewPrompt = typeof ReviewPromptModule;

const NOW = new Date(2026, 9, 18, 12).getTime();

function load(): {
  prompt: ReviewPrompt;
  raiseNotice: () => void;
} {
  let prompt!: ReviewPrompt;
  let raiseNotice!: () => void;
  jest.isolateModules(() => {
    prompt = require("@/services/reviewPrompt");
    const notice = require("@/stores/playbackNotice").default;
    raiseNotice = () => notice.getState().raise("PLAYBACK_SOURCE_UNAVAILABLE");
  });
  return { prompt, raiseNotice };
}

function seed(state: Partial<ReviewPromptModule.ReviewPromptState>) {
  mockMem.set(
    "reviewPrompt",
    JSON.stringify({
      countedPlays: 30,
      activeDays: 5,
      lastActiveDay: null,
      attempts: 0,
      lastAttemptAt: null,
      ...state,
    }),
  );
}

async function request(prompt: ReviewPrompt) {
  const done = prompt.maybeRequestReview();
  await jest.advanceTimersByTimeAsync(2000);
  await done;
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockMem.clear();
  mockRequestReview.mockReset().mockResolvedValue(undefined);
  mockIsAvailable.mockReset().mockResolvedValue(true);
  mockDistribution.isStoreDistribution = true;
  mockInstalledAt = NOW - 30 * DAY;
  Object.assign(mockEnv, {
    appState: "active",
    carConnected: false,
    remoteTarget: null,
    online: true,
    authenticated: true,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("noteCountedPlay", () => {
  it("counts plays and distinct days", () => {
    const { prompt } = load();
    prompt.noteCountedPlay();
    prompt.noteCountedPlay();
    expect(prompt.readReviewPromptState()).toMatchObject({
      countedPlays: 2,
      activeDays: 1,
    });

    jest.setSystemTime(NOW + DAY);
    prompt.noteCountedPlay();
    expect(prompt.readReviewPromptState()).toMatchObject({
      countedPlays: 3,
      activeDays: 2,
    });
  });

  it("stores its state outside Android Auto Backup", () => {
    const { prompt } = load();
    prompt.noteCountedPlay();
    expect(mockCreateMMKV).toHaveBeenCalledWith({
      id: "reviewPrompt",
      path: "/data/user/0/com.jmercier.wavio/no_backup",
    });
  });

  it("stops counting once the cap is reached", () => {
    seed({ attempts: 3, countedPlays: 7 });
    const { prompt } = load();
    prompt.noteCountedPlay();
    expect(prompt.readReviewPromptState().countedPlays).toBe(7);
  });

  it("records nothing outside a Play Store build", () => {
    mockDistribution.isStoreDistribution = false;
    const { prompt } = load();
    prompt.noteCountedPlay();
    expect(prompt.readReviewPromptState().countedPlays).toBe(0);
  });
});

describe("maybeRequestReview", () => {
  it("asks an engaged user and starts over afterwards", async () => {
    seed({});
    const { prompt } = load();
    await request(prompt);
    expect(mockRequestReview).toHaveBeenCalledTimes(1);
    expect(prompt.readReviewPromptState()).toEqual({
      countedPlays: 0,
      activeDays: 0,
      lastActiveDay: null,
      attempts: 1,
      lastAttemptAt: NOW + 1500,
    });
  });

  it.each([
    ["too few plays", { countedPlays: 29 }],
    ["too few active days", { activeDays: 4 }],
    ["the cap is reached", { attempts: 3 }],
    [
      "the cooldown is running",
      { attempts: 1, lastAttemptAt: NOW - 119 * DAY },
    ],
  ])("does not ask when %s", async (_, state) => {
    seed(state);
    const { prompt } = load();
    await request(prompt);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it("asks again once the cooldown is over", async () => {
    seed({ attempts: 2, lastAttemptAt: NOW - 120 * DAY });
    const { prompt } = load();
    await request(prompt);
    expect(mockRequestReview).toHaveBeenCalledTimes(1);
    expect(prompt.readReviewPromptState().attempts).toBe(3);
  });

  it("does not ask a recent install", async () => {
    seed({});
    mockInstalledAt = NOW - 6 * DAY;
    const { prompt } = load();
    await request(prompt);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it("does not ask without the Play Store", async () => {
    seed({});
    mockIsAvailable.mockResolvedValue(false);
    const { prompt } = load();
    await request(prompt);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it("does not ask outside a Play Store build", async () => {
    seed({});
    mockDistribution.isStoreDistribution = false;
    const { prompt } = load();
    await request(prompt);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it.each([
    ["in a car", () => (mockEnv.carConnected = true)],
    ["casting", () => (mockEnv.remoteTarget = { id: "upnp" })],
    ["offline", () => (mockEnv.online = false)],
    ["signed out", () => (mockEnv.authenticated = false)],
    ["in the background", () => (mockEnv.appState = "background")],
  ])("does not ask while %s", async (_, arrange) => {
    seed({});
    arrange();
    const { prompt } = load();
    await request(prompt);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it("gives up when the moment passes during the settle delay", async () => {
    seed({});
    const { prompt } = load();
    const done = prompt.maybeRequestReview();
    await jest.advanceTimersByTimeAsync(500);
    mockEnv.carConnected = true;
    await jest.advanceTimersByTimeAsync(1500);
    await done;
    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(prompt.readReviewPromptState().attempts).toBe(0);
  });

  it("gives up when the settle delay wakes up late", async () => {
    seed({});
    const { prompt } = load();
    const done = prompt.maybeRequestReview();
    await jest.advanceTimersByTimeAsync(0);
    jest.setSystemTime(Date.now() + 60 * 60 * 1000);
    await jest.advanceTimersByTimeAsync(2000);
    await done;
    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(prompt.readReviewPromptState().attempts).toBe(0);
  });

  it("does not ask after a playback problem this session", async () => {
    seed({});
    const { prompt, raiseNotice } = load();
    raiseNotice();
    await request(prompt);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it("does not ask after an update was offered this session", async () => {
    seed({});
    const { prompt } = load();
    prompt.noteUpdateOffered();
    await request(prompt);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it("asks at most once per session", async () => {
    seed({ attempts: 0 });
    const { prompt } = load();
    await request(prompt);
    seed({ attempts: 1, lastAttemptAt: NOW - 200 * DAY });
    await request(prompt);
    expect(mockRequestReview).toHaveBeenCalledTimes(1);
  });

  it("keeps the attempt when Play rejects the flow", async () => {
    seed({});
    mockRequestReview.mockRejectedValue(new Error("quota"));
    const { prompt } = load();
    await request(prompt);
    expect(prompt.readReviewPromptState().attempts).toBe(1);
  });
});
