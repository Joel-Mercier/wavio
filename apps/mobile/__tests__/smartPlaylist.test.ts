import {
  type FormNode,
  type FormRule,
  fromNavidromeCriteria,
  getAvailableFields,
  getFieldByKey,
  getOperatorsForField,
  type SmartPlaylistFormState,
  toNavidromeCriteria,
} from "@/utils/smartPlaylist";

const baseRule = (over: Partial<FormRule>): FormRule => ({
  field: "title",
  operator: "contains",
  value: "",
  valueMax: "",
  boolValue: false,
  playlistId: "",
  ...over,
});

const form = (rules: FormNode[]): SmartPlaylistFormState => ({
  name: "test",
  comment: "",
  isPublic: false,
  combinator: "all",
  rules,
  sorts: [],
  limit: "",
  refreshDelay: "",
});

const V062 = "0.62.0";
const V061 = "0.61.0";
const V063 = "0.63.2";
const V064 = "0.64.0";

describe("smartPlaylist ReplayGain criteria", () => {
  it("coerces a ReplayGain field to a numeric Navidrome rule", () => {
    const criteria = toNavidromeCriteria(
      form([baseRule({ field: "rgalbumgain", operator: "gt", value: "-6.5" })]),
      V062,
    );
    expect(criteria.all).toEqual([{ gt: { rgalbumgain: -6.5 } }]);
  });

  it("round-trips a ReplayGain rule", () => {
    const original = form([
      baseRule({ field: "rgtrackpeak", operator: "lt", value: "1" }),
    ]);
    const parsed = fromNavidromeCriteria(toNavidromeCriteria(original, V062));
    expect(parsed.rules).toEqual([
      baseRule({ field: "rgtrackpeak", operator: "lt", value: "1" }),
    ]);
  });

  it("hides ReplayGain fields on servers older than v0.62.0", () => {
    const keys = getAvailableFields(V061).map((f) => f.key);
    expect(keys).not.toContain("rgalbumgain");
    expect(getAvailableFields(V062).map((f) => f.key)).toContain("rgalbumgain");
  });
});

describe("smartPlaylist isMissing/isPresent operators", () => {
  it("coerces a tag-presence rule to a boolean Navidrome rule", () => {
    const criteria = toNavidromeCriteria(
      form([
        baseRule({ field: "genre", operator: "isMissing", boolValue: true }),
      ]),
      V062,
    );
    expect(criteria.all).toEqual([{ isMissing: { genre: true } }]);
  });

  it("round-trips a tag-presence rule", () => {
    const original = form([
      baseRule({ field: "genre", operator: "isPresent", boolValue: false }),
    ]);
    const parsed = fromNavidromeCriteria(toNavidromeCriteria(original, V062));
    expect(parsed.rules).toEqual([
      baseRule({ field: "genre", operator: "isPresent", boolValue: false }),
    ]);
  });

  it("exposes tag-presence operators only for tag fields on v0.62.0+", () => {
    const genre = getFieldByKey("genre");
    const title = getFieldByKey("title");
    if (!genre || !title) throw new Error("expected genre and title fields");
    expect(getOperatorsForField(genre, V062)).toContain("isMissing");
    expect(getOperatorsForField(genre, V062)).toContain("isPresent");
    expect(getOperatorsForField(genre, V061)).not.toContain("isMissing");
    expect(getOperatorsForField(title, V062)).not.toContain("isMissing");
  });
});

describe("smartPlaylist rule groups", () => {
  it("serializes a nested group alongside a top-level rule", () => {
    const criteria = toNavidromeCriteria(
      form([
        baseRule({ field: "loved", operator: "is", boolValue: true }),
        {
          combinator: "any",
          rules: [
            baseRule({ field: "playcount", operator: "gt", value: "10" }),
            baseRule({ field: "rating", operator: "is", value: "5" }),
          ],
        },
      ]),
      V062,
    );
    expect(criteria.all).toEqual([
      { is: { loved: true } },
      {
        any: [{ gt: { playcount: 10 } }, { is: { rating: 5 } }],
      },
    ]);
  });

  it("round-trips a one-level group", () => {
    const original = form([
      baseRule({ field: "title", operator: "contains", value: "love" }),
      {
        combinator: "any",
        rules: [baseRule({ field: "year", operator: "gt", value: "1990" })],
      },
    ]);
    const parsed = fromNavidromeCriteria(toNavidromeCriteria(original, V062));
    expect(parsed.rules).toEqual(original.rules);
  });

  it("round-trips a group nested three levels deep", () => {
    const original = form([
      {
        combinator: "any",
        rules: [
          baseRule({ field: "genre", operator: "is", value: "Rock" }),
          {
            combinator: "all",
            rules: [
              baseRule({ field: "bpm", operator: "lt", value: "100" }),
              {
                combinator: "any",
                rules: [
                  baseRule({
                    field: "album",
                    operator: "startsWith",
                    value: "A",
                  }),
                ],
              },
            ],
          },
        ],
      },
    ]);
    const parsed = fromNavidromeCriteria(toNavidromeCriteria(original, V062));
    expect(parsed.rules).toEqual(original.rules);
  });

  it("round-trips a playlist reference nested inside a group", () => {
    const original = form([
      {
        combinator: "all",
        rules: [
          baseRule({
            operator: "notInPlaylist",
            field: "id",
            playlistId: "pl-1",
          }),
        ],
      },
    ]);
    const parsed = fromNavidromeCriteria(toNavidromeCriteria(original, V062));
    expect(parsed.rules).toEqual(original.rules);
  });

  it("accepts the lowercased conjunction keys Navidrome parses", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ ANY: [{ is: { loved: true } }] }] as never,
    });
    expect(parsed.rules).toEqual([
      {
        combinator: "any",
        rules: [baseRule({ field: "loved", operator: "is", boolValue: true })],
      },
    ]);
  });
});

describe("smartPlaylist criteria the app can't model", () => {
  it("drops a group left empty by unsupported fields", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ any: [{ is: { filetype: "flac" } }] }] as never,
    });
    expect(parsed.rules).toEqual([]);
  });

  it("keeps the surviving siblings of a dropped group", () => {
    const parsed = fromNavidromeCriteria({
      all: [
        { any: [{ is: { filetype: "flac" } }] },
        { is: { loved: true } },
      ] as never,
    });
    expect(parsed.rules).toEqual([
      baseRule({ field: "loved", operator: "is", boolValue: true }),
    ]);
  });

  it("never serializes an empty group", () => {
    const criteria = toNavidromeCriteria(
      form([
        baseRule({ field: "title", operator: "contains", value: "love" }),
        { combinator: "any", rules: [] },
      ]),
      V062,
    );
    expect(criteria.all).toEqual([{ contains: { title: "love" } }]);
  });

  it("drops an operator it doesn't know", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ isBetween: { title: "x" } }] as never,
    });
    expect(parsed.rules).toEqual([]);
  });

  it("accepts the operator and field casing Navidrome lowercases", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ IsNot: { Title: "x" } }, { NOTINTHELAST: { LastPlayed: 30 } }],
    } as never);
    expect(parsed.rules).toEqual([
      baseRule({ field: "title", operator: "isNot", value: "x" }),
      baseRule({ field: "lastplayed", operator: "notInTheLast", value: "30" }),
    ]);
  });
});

describe("smartPlaylist refreshDelay", () => {
  it("round-trips a refresh delay", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ is: { loved: true } }],
      sort: "random",
      limit: 500,
      refreshDelay: "1d",
    });
    expect(parsed.refreshDelay).toBe("1d");
    const criteria = toNavidromeCriteria(
      { ...form(parsed.rules), ...parsed },
      V064,
    );
    expect(criteria.refreshDelay).toBe("1d");
  });

  it("omits the key entirely when left on the server default", () => {
    const criteria = toNavidromeCriteria(
      form([baseRule({ value: "x" })]),
      V064,
    );
    expect(criteria).not.toHaveProperty("refreshDelay");
  });

  // The editor hides the control below v0.64.0, but a value already on the
  // playlist must survive a save made from an older-looking server — including
  // one whose version string we couldn't parse at all.
  it("preserves a delay it can't offer a control for", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ is: { loved: true } }],
      refreshDelay: "1w",
    });
    expect(
      toNavidromeCriteria({ ...form(parsed.rules), ...parsed }, V063)
        .refreshDelay,
    ).toBe("1w");
    expect(
      toNavidromeCriteria({ ...form(parsed.rules), ...parsed }, null)
        .refreshDelay,
    ).toBe("1w");
  });

  it("keeps a delay authored outside our presets", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ is: { loved: true } }],
      refreshDelay: "1d12h",
    });
    expect(parsed.refreshDelay).toBe("1d12h");
  });
});

describe("smartPlaylist criteria keys the editor doesn't model", () => {
  it("carries limitPercent and offset through a form round-trip", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ is: { loved: true } }],
      limitPercent: 25,
      offset: 10,
    });
    expect(parsed.passthrough).toEqual({ limitPercent: 25, offset: 10 });
    const criteria = toNavidromeCriteria(
      { ...form(parsed.rules), ...parsed },
      V064,
    );
    expect(criteria.limitPercent).toBe(25);
    expect(criteria.offset).toBe(10);
  });

  it("doesn't invent them when the playlist had none", () => {
    const parsed = fromNavidromeCriteria({ all: [{ is: { loved: true } }] });
    expect(parsed.passthrough).toEqual({});
    const criteria = toNavidromeCriteria(
      { ...form(parsed.rules), ...parsed },
      V064,
    );
    expect(criteria).not.toHaveProperty("limitPercent");
    expect(criteria).not.toHaveProperty("offset");
  });

  // limitPercent: 0 is a real value Navidrome clamps to, and `if (value)`
  // would drop it.
  it("preserves a zero offset", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ is: { loved: true } }],
      offset: 0,
    });
    expect(
      toNavidromeCriteria({ ...form(parsed.rules), ...parsed }, V064).offset,
    ).toBe(0);
  });

  // The point of keeping the blob opaque: a criteria key Navidrome hasn't
  // shipped yet survives an edit without anything here naming it.
  it("carries a key this app has never heard of", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ is: { loved: true } }],
      somethingNavidromeAddsLater: { nested: ["value"] },
    });
    expect(parsed.passthrough).toEqual({
      somethingNavidromeAddsLater: { nested: ["value"] },
    });
    const criteria = toNavidromeCriteria(
      { ...form(parsed.rules), ...parsed },
      V064,
    );
    expect(criteria.somethingNavidromeAddsLater).toEqual({
      nested: ["value"],
    });
  });

  it("never lets a stale copy of a modeled key back in", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ is: { loved: true } }],
      sort: "artist",
      order: "asc",
      limit: 20,
      refreshDelay: "1h",
      offset: 5,
    });
    expect(parsed.passthrough).toEqual({ offset: 5 });
    const criteria = toNavidromeCriteria(
      {
        ...form(parsed.rules),
        ...parsed,
        sorts: [{ field: "title", direction: "desc" }],
        limit: "3",
        refreshDelay: "6h",
      },
      V064,
    );
    expect(criteria.sort).toBe("title");
    expect(criteria.order).toBe("desc");
    expect(criteria.limit).toBe(3);
    expect(criteria.refreshDelay).toBe("6h");
    expect(criteria.offset).toBe(5);
  });

  // Clearing the limit means "no limit", and the editor's empty value has to
  // win over the one the server sent — the modeled keys aren't passthrough.
  it("drops a modeled key the editor cleared", () => {
    const parsed = fromNavidromeCriteria({
      all: [{ is: { loved: true } }],
      limit: 20,
      offset: 5,
    });
    const criteria = toNavidromeCriteria(
      { ...form(parsed.rules), ...parsed, limit: "" },
      V064,
    );
    expect(criteria).not.toHaveProperty("limit");
    expect(criteria.offset).toBe(5);
  });
});
