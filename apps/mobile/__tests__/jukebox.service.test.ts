jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

const mockStatusJukebox = jest.fn();
jest.mock("@/services/backend/jukebox", () => ({
  addJukebox: jest.fn(),
  clearJukebox: jest.fn(),
  setGainJukebox: jest.fn(),
  setJukebox: jest.fn(),
  skipJukebox: jest.fn(),
  startJukebox: jest.fn(),
  statusJukebox: () => mockStatusJukebox(),
  stopJukebox: jest.fn(),
}));

const mockQueueState: {
  currentIndex: number | null;
  setCurrentIndex: jest.Mock;
} = { currentIndex: 0, setCurrentIndex: jest.fn() };
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: { getState: () => mockQueueState },
}));

import { jukeboxRefreshStatus } from "@/services/jukebox";
import type { JukeboxStatus } from "@/services/openSubsonic/types";
import useJukebox from "@/stores/jukebox";

const status = (currentIndex: number): { jukeboxStatus: JukeboxStatus } => ({
  jukeboxStatus: { currentIndex, gain: 0.5, playing: true, position: 0 },
});

beforeEach(() => {
  mockStatusJukebox.mockReset();
  mockQueueState.currentIndex = 0;
  mockQueueState.setCurrentIndex = jest.fn();
  useJukebox.setState({ active: false, status: null, gain: 0.5 }, false);
});

describe("jukebox service - refreshStatus reconciliation", () => {
  test("stores the latest server status", async () => {
    mockStatusJukebox.mockResolvedValue(status(3));
    await jukeboxRefreshStatus();
    expect(useJukebox.getState().status?.currentIndex).toBe(3);
  });

  test("reconciles the local queue index when the server advanced", async () => {
    mockQueueState.currentIndex = 0;
    mockStatusJukebox.mockResolvedValue(status(2));
    await jukeboxRefreshStatus();
    expect(mockQueueState.setCurrentIndex).toHaveBeenCalledWith(2);
  });

  test("does not touch the queue when indexes already match", async () => {
    mockQueueState.currentIndex = 2;
    mockStatusJukebox.mockResolvedValue(status(2));
    await jukeboxRefreshStatus();
    expect(mockQueueState.setCurrentIndex).not.toHaveBeenCalled();
  });

  test("treats a null local index as 0", async () => {
    mockQueueState.currentIndex = null;
    mockStatusJukebox.mockResolvedValue(status(0));
    await jukeboxRefreshStatus();
    expect(mockQueueState.setCurrentIndex).not.toHaveBeenCalled();
  });

  test("swallows transient status errors without throwing", async () => {
    mockStatusJukebox.mockRejectedValue(new Error("network"));
    await expect(jukeboxRefreshStatus()).resolves.toBeUndefined();
    expect(mockQueueState.setCurrentIndex).not.toHaveBeenCalled();
  });
});
