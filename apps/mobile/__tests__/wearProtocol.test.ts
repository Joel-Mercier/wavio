import {
  PATH_ARTWORK,
  PATH_COMMAND,
  PATH_PROGRESS,
  PATH_QUEUE,
  PATH_STATE,
  PROTOCOL_VERSION,
  parseCommand,
} from "@/services/wear/protocol";

// The watch and the phone ship as separate artifacts and will routinely run
// mismatched versions, so the contract these tests pin down is compatibility in
// both directions — not just that a well-formed message parses.

describe("wear protocol paths", () => {
  it("carries the protocol version in every path", () => {
    for (const path of [
      PATH_STATE,
      PATH_QUEUE,
      PATH_ARTWORK,
      PATH_COMMAND,
      PATH_PROGRESS,
    ]) {
      expect(path).toMatch(new RegExp(`^/wavio/v${PROTOCOL_VERSION}/`));
    }
  });

  it("keeps every path distinct", () => {
    const paths = [
      PATH_STATE,
      PATH_QUEUE,
      PATH_ARTWORK,
      PATH_COMMAND,
      PATH_PROGRESS,
    ];
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("matches the prefix the native manifest filters on", () => {
    // modules/wear-bridge's AndroidManifest declares pathPrefix="/wavio/";
    // a path outside it would never reach WavioWearListenerService.
    expect(PATH_COMMAND.startsWith("/wavio/")).toBe(true);
  });
});

describe("parseCommand", () => {
  it("parses the bare transport actions", () => {
    for (const action of [
      "play",
      "pause",
      "next",
      "previous",
      "subscribe",
      "unsubscribe",
    ] as const) {
      expect(parseCommand({ v: 1, action })).toEqual({ v: 1, action });
    }
  });

  it("parses valued actions", () => {
    expect(parseCommand({ v: 1, action: "seek", value: 42_000 })).toEqual({
      v: 1,
      action: "seek",
      value: 42_000,
    });
    expect(parseCommand({ v: 1, action: "seekToIndex", value: 7 })).toEqual({
      v: 1,
      action: "seekToIndex",
      value: 7,
    });
    expect(parseCommand({ v: 1, action: "repeat", value: "one" })).toEqual({
      v: 1,
      action: "repeat",
      value: "one",
    });
    expect(parseCommand({ v: 1, action: "shuffle", value: true })).toEqual({
      v: 1,
      action: "shuffle",
      value: true,
    });
  });

  it("drops actions a newer watch might send, instead of throwing", () => {
    // Rule 1: forward compatibility. A watch on a later protocol will send
    // things this build has never heard of; they must be ignored silently.
    expect(parseCommand({ v: 2, action: "setVolume", value: 0.5 })).toBeNull();
    expect(parseCommand({ v: 9, action: "sleepTimer" })).toBeNull();
  });

  it("ignores unknown extra fields on a known action", () => {
    // Rule 2: additive fields must not break an older reader.
    expect(parseCommand({ v: 1, action: "play", lyricsVisible: true })).toEqual(
      { v: 1, action: "play" },
    );
  });

  it("rejects malformed payloads rather than throwing", () => {
    expect(parseCommand(null)).toBeNull();
    expect(parseCommand("play")).toBeNull();
    expect(parseCommand({})).toBeNull();
    expect(parseCommand({ v: 1 })).toBeNull();
    expect(parseCommand({ v: 1, action: 3 })).toBeNull();
    // A valued action with no usable value is not actionable.
    expect(parseCommand({ v: 1, action: "seek" })).toBeNull();
    expect(parseCommand({ v: 1, action: "seek", value: "30s" })).toBeNull();
    expect(
      parseCommand({ v: 1, action: "repeat", value: "sometimes" }),
    ).toBeNull();
  });

  it("defaults a missing version rather than rejecting the message", () => {
    expect(parseCommand({ action: "pause" })).toEqual({
      v: PROTOCOL_VERSION,
      action: "pause",
    });
  });

  it("coerces a shuffle value the way the phone will apply it", () => {
    expect(parseCommand({ v: 1, action: "shuffle", value: 0 })).toEqual({
      v: 1,
      action: "shuffle",
      value: false,
    });
  });

  it("reads the watch's advertised version from hello", () => {
    expect(parseCommand({ v: 1, action: "hello", protocolVersion: 3 })).toEqual(
      {
        v: 1,
        action: "hello",
        protocolVersion: 3,
      },
    );
    expect(parseCommand({ v: 1, action: "hello" })).toEqual({
      v: 1,
      action: "hello",
      protocolVersion: 1,
    });
  });
});
