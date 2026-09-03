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
});

const V062 = "0.62.0";
const V061 = "0.61.0";

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
