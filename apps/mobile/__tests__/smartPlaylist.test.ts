import {
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

const form = (rules: FormRule[]): SmartPlaylistFormState => ({
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
