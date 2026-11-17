// Issue #283: a restart (an app kill, or a car reconnecting to a process that
// died meanwhile) must pick the launch track up where it was, from a position
// saved on the device, and only that track.
const mockMem = new Map<string, string>();
let mockWrites = 0;
jest.mock("@/config/storage", () => ({
  getNoBackupStorage: () => ({
    set: (k: string, v: string) => {
      mockWrites++;
      mockMem.set(k, v);
    },
    getString: (k: string) => mockMem.get(k),
    remove: (k: string) => mockMem.delete(k),
  }),
}));
jest.mock("@/services/backend/bookmarks", () => ({
  createBookmark: jest.fn(async () => {}),
  deleteBookmark: jest.fn(async () => {}),
  getBookmarks: jest.fn(async () => ({})),
}));
jest.mock("@/services/backend/capabilities", () => ({
  getCapabilities: () => ({ bookmarks: true }),
}));
let mockScope = "server-a";
jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => mockScope,
  useAuthBase: {
    getState: () => ({ url: "u", username: "n" }),
    subscribe: jest.fn(),
  },
}));

import type * as ResumePositions from "@/services/resumePositions";
import type { QueueTrack } from "@/stores/queue";

const song = (id: string, duration = 240): QueueTrack => ({
  id,
  url: `https://server/${id}`,
  duration,
});

let resume: typeof ResumePositions;

beforeEach(() => {
  mockMem.clear();
  mockWrites = 0;
  mockScope = "server-a";
  jest.isolateModules(() => {
    resume = require("@/services/resumePositions");
  });
});

// A fresh module stands in for the next process: only the device storage
// survives it.
const restart = () => {
  jest.isolateModules(() => {
    resume = require("@/services/resumePositions");
  });
};

describe("saved playback position", () => {
  test("resumes the launch track where it was after a restart", () => {
    resume.recordResumePosition(song("a"), 93, { force: true });
    restart();
    resume.armResume("a");
    expect(resume.getResumePosition(song("a"))).toBe(93);
  });

  test("covers short songs, not just the long tracks bookmarks were for", () => {
    resume.recordResumePosition(song("a", 150), 40, { force: true });
    restart();
    resume.armResume("a");
    expect(resume.getResumePosition(song("a", 150))).toBe(40);
  });

  test("never resumes a track that isn't the armed launch track", () => {
    resume.recordResumePosition(song("a"), 93, { force: true });
    restart();
    resume.armResume("b");
    expect(resume.getResumePosition(song("a"))).toBeNull();
  });

  test("starts at 0 once the resumed play has settled", () => {
    resume.recordResumePosition(song("a"), 93, { force: true });
    restart();
    resume.armResume("a");
    resume.settleResume("a");
    expect(resume.getResumePosition(song("a"))).toBeNull();
  });

  test("ignores the very start and the tail", () => {
    resume.recordResumePosition(song("a"), 3, { force: true });
    resume.armResume("a");
    expect(resume.getResumePosition(song("a"))).toBeNull();

    resume.recordResumePosition(song("b", 240), 235, { force: true });
    resume.armResume("b");
    expect(resume.getResumePosition(song("b", 240))).toBeNull();
  });

  test("forgets a finished track", () => {
    resume.recordResumePosition(song("a"), 93, { force: true });
    resume.clearResumePosition("a");
    restart();
    resume.armResume("a");
    expect(resume.getResumePosition(song("a"))).toBeNull();
  });

  test("skips radio and spoken word", () => {
    const radio = { ...song("r"), isRadio: true };
    resume.recordResumePosition(radio, 93, { force: true });
    resume.armResume("r");
    expect(resume.getResumePosition(radio)).toBeNull();
    expect(mockMem.size).toBe(0);
  });

  test("throttles writes while playing, but not forced ones", () => {
    resume.recordResumePosition(song("a"), 10);
    resume.recordResumePosition(song("a"), 11);
    resume.armResume("a");
    expect(resume.getResumePosition(song("a"))).toBe(10);

    resume.recordResumePosition(song("a"), 12, { force: true });
    expect(resume.getResumePosition(song("a"))).toBe(12);
  });

  test("writes a pause once, though pause() and its status both save it", () => {
    resume.recordResumePosition(song("a"), 93.2, { force: true });
    resume.recordResumePosition(song("a"), 93.4, { force: true });
    expect(mockWrites).toBe(1);
  });

  test("a server queue's position replaces the one saved on the device", () => {
    resume.recordResumePosition(song("a"), 93, { force: true });
    resume.armResumeAt(song("a"), 150);
    expect(resume.getResumePosition(song("a"))).toBe(150);

    resume.armResumeAt(song("a"), 2);
    expect(resume.getResumePosition(song("a"))).toBeNull();
  });

  test("keeps each server's position apart", () => {
    resume.recordResumePosition(song("a"), 93, { force: true });
    mockScope = "server-b";
    restart();
    resume.armResume("a");
    expect(resume.getResumePosition(song("a"))).toBeNull();
  });
});
