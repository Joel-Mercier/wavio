import {
  availableSortFields,
  buildSortType,
  effectiveSort,
  hasSortData,
  parseSortType,
  type SortFieldSpecs,
  sortItems,
  toggleSortType,
} from "@/utils/sort";

type Item = { id: string; name?: string; count?: number; group?: string };
type Field = "order" | "name" | "count" | "group";

const specs: SortFieldSpecs<Item, Field> = {
  order: { value: () => undefined, order: true },
  name: { value: (item) => item.name, always: true },
  count: { value: (item) => item.count, zeroIsEmpty: true },
  group: {
    value: (item) => item.group,
    tiebreakers: [(item) => item.count, (item) => item.name],
  },
};

const ids = (items: Item[]) => items.map((item) => item.id);

describe("parse / build / toggle", () => {
  it("splits a sort value into field and direction", () => {
    expect(parseSortType<Field>("nameAsc")).toEqual({
      field: "name",
      direction: "asc",
    });
    expect(parseSortType<Field>("countDesc")).toEqual({
      field: "count",
      direction: "desc",
    });
  });

  it("round-trips through buildSortType", () => {
    expect(buildSortType("group", "desc")).toBe("groupDesc");
    expect(buildSortType("group", "asc")).toBe("groupAsc");
  });

  it("toggles the active field and resets to ascending on a new field", () => {
    expect(toggleSortType<Field>("nameAsc", "name")).toBe("nameDesc");
    expect(toggleSortType<Field>("nameDesc", "name")).toBe("nameAsc");
    expect(toggleSortType<Field>("nameDesc", "count")).toBe("countAsc");
  });
});

describe("sortItems", () => {
  it("keeps or reverses the incoming order for an order field", () => {
    const items: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(ids(sortItems(items, "orderAsc", specs))).toEqual(["a", "b", "c"]);
    expect(ids(sortItems(items, "orderDesc", specs))).toEqual(["c", "b", "a"]);
  });

  it("never mutates the input", () => {
    const items: Item[] = [
      { id: "b", name: "b" },
      { id: "a", name: "a" },
    ];
    sortItems(items, "nameAsc", specs);
    sortItems(items, "orderDesc", specs);
    expect(ids(items)).toEqual(["b", "a"]);
  });

  it("sorts strings and numbers in both directions", () => {
    const items: Item[] = [
      { id: "2", name: "b", count: 2 },
      { id: "1", name: "a", count: 1 },
      { id: "3", name: "c", count: 3 },
    ];
    expect(ids(sortItems(items, "nameAsc", specs))).toEqual(["1", "2", "3"]);
    expect(ids(sortItems(items, "nameDesc", specs))).toEqual(["3", "2", "1"]);
    expect(ids(sortItems(items, "countAsc", specs))).toEqual(["1", "2", "3"]);
    expect(ids(sortItems(items, "countDesc", specs))).toEqual(["3", "2", "1"]);
  });

  it("pins items without a value last in both directions", () => {
    const items: Item[] = [
      { id: "missing" },
      { id: "b", group: "b" },
      { id: "blank", group: "   " },
      { id: "a", group: "a" },
      { id: "zero", count: 0 },
    ];
    expect(ids(sortItems(items, "groupAsc", specs))).toEqual([
      "a",
      "b",
      "missing",
      "blank",
      "zero",
    ]);
    expect(ids(sortItems(items, "groupDesc", specs))).toEqual([
      "b",
      "a",
      "missing",
      "blank",
      "zero",
    ]);
  });

  it("treats 0 as no data for zeroIsEmpty fields", () => {
    const items: Item[] = [
      { id: "zero", count: 0 },
      { id: "one", count: 1 },
    ];
    expect(ids(sortItems(items, "countAsc", specs))).toEqual(["one", "zero"]);
    expect(ids(sortItems(items, "countDesc", specs))).toEqual(["one", "zero"]);
  });

  it("applies tiebreakers ascending, whatever the primary direction", () => {
    const items: Item[] = [
      { id: "g1-c2", group: "g", count: 2, name: "z" },
      { id: "g1-c1", group: "g", count: 1, name: "y" },
      { id: "h", group: "h", count: 9, name: "x" },
    ];
    expect(ids(sortItems(items, "groupAsc", specs))).toEqual([
      "g1-c1",
      "g1-c2",
      "h",
    ]);
    expect(ids(sortItems(items, "groupDesc", specs))).toEqual([
      "h",
      "g1-c1",
      "g1-c2",
    ]);
  });

  it("keeps the incoming order for full ties (stable)", () => {
    const items: Item[] = [
      { id: "first", group: "g" },
      { id: "second", group: "g" },
      { id: "third", group: "g" },
    ];
    expect(ids(sortItems(items, "groupAsc", specs))).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(ids(sortItems(items, "groupDesc", specs))).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("returns a copy untouched for an unknown field", () => {
    const items: Item[] = [{ id: "a" }, { id: "b" }];
    expect(
      ids(
        sortItems(
          items,
          "nopeAsc" as unknown as `${Field}Asc`,
          specs as unknown as SortFieldSpecs<Item, Field>,
        ),
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("availability", () => {
  const withData: Item[] = [{ id: "a", group: "rock", count: 3 }];
  const withoutData: Item[] = [{ id: "a" }, { id: "b", group: "", count: 0 }];

  it("hasSortData ignores coverage for always/order fields", () => {
    expect(hasSortData(withoutData, specs.order)).toBe(true);
    expect(hasSortData(withoutData, specs.name)).toBe(true);
    expect(hasSortData(withoutData, specs.group)).toBe(false);
    expect(hasSortData(withoutData, specs.count)).toBe(false);
    expect(hasSortData(withData, specs.group)).toBe(true);
    expect(hasSortData(withData, specs.count)).toBe(true);
  });

  it("availableSortFields drops uncovered fields but keeps the given order", () => {
    const fields: Field[] = ["order", "name", "group", "count"];
    expect(availableSortFields(withData, specs, fields)).toEqual(fields);
    expect(availableSortFields(withoutData, specs, fields)).toEqual([
      "order",
      "name",
    ]);
  });

  it("availableSortFields honours the capability predicate first", () => {
    const fields: Field[] = ["order", "name", "group"];
    expect(
      availableSortFields(
        withData,
        specs,
        fields,
        (field) => field !== "group",
      ),
    ).toEqual(["order", "name"]);
  });

  it("effectiveSort falls back only when the field is unavailable", () => {
    expect(
      effectiveSort<Field>("groupDesc", ["order", "group"], "orderAsc"),
    ).toBe("groupDesc");
    expect(effectiveSort<Field>("groupDesc", ["order"], "orderAsc")).toBe(
      "orderAsc",
    );
  });
});
