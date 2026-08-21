// Client-side list sorting shared by every "sort this list" sheet in the app
// (playlist entries, favorites, downloads, the library index, genres). Item-type
// agnostic: a screen describes its sortable fields with `SortFieldSpec`s and this
// engine owns direction, missing-value placement, tie-breaking and which options
// are offerable at all.

export type SortDirection = "asc" | "desc";

// Every persisted sort in the app is a `<field>Asc` / `<field>Desc` string, so
// the field set is the single source of truth for the valid sort values.
export type SortType<F extends string> = `${F}Asc` | `${F}Desc`;

export type SortValue = string | number | undefined | null;

export type SortFieldSpec<T> = {
  // The primary key. Return undefined/null/"" when the item has no value for
  // this field: those items always sort last, whatever the direction.
  value: (item: T) => SortValue;
  // Compared (always ascending) when the primary keys tie, e.g. album → disc →
  // track so an album's songs stay in playing order inside an artist sort.
  tiebreakers?: ((item: T) => SortValue)[];
  // The field is the list's incoming order rather than a value read off the
  // items: `Asc` keeps it as-is, `Desc` reverses it.
  order?: boolean;
  // Offer the field without checking that any item actually has data for it.
  // Implied by `order`.
  always?: boolean;
  // A numeric field whose "no data" state is 0 rather than undefined (play
  // count, rating, counts) — an all-zero list offers no such option.
  zeroIsEmpty?: boolean;
};

export type SortFieldSpecs<T, F extends string> = Record<F, SortFieldSpec<T>>;

// Every backend types its date fields as `Date`, but only the local library
// actually builds one: the JSON APIs hand back ISO strings that nothing
// revives, so a `.getTime()` on the raw value throws on a server browse.
export function sortTime(
  value: Date | string | undefined | null,
): number | undefined {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

export function parseSortType<F extends string>(
  sort: SortType<F>,
): { field: F; direction: SortDirection } {
  return sort.endsWith("Desc")
    ? { field: sort.slice(0, -4) as F, direction: "desc" }
    : { field: sort.slice(0, -3) as F, direction: "asc" };
}

export function buildSortType<F extends string>(
  field: F,
  direction: SortDirection,
): SortType<F> {
  return `${field}${direction === "desc" ? "Desc" : "Asc"}` as SortType<F>;
}

// Flips the direction of the active field, or switches to `field` in ascending
// order — the behaviour every sort sheet row already had.
export function toggleSortType<F extends string>(
  sort: SortType<F>,
  field: F,
): SortType<F> {
  const { field: activeField, direction } = parseSortType(sort);
  if (activeField !== field) return buildSortType(field, "asc");
  return buildSortType(field, direction === "asc" ? "desc" : "asc");
}

function isEmptyValue(value: SortValue, zeroIsEmpty?: boolean): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Number.isNaN(value)) return true;
  return zeroIsEmpty ? value === 0 : false;
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "string" || typeof b === "string") {
    return String(a ?? "").localeCompare(String(b ?? ""));
  }
  return (a ?? 0) - (b ?? 0);
}

// Compares the primary key with missing values pinned last (in both
// directions), then the tiebreakers ascending. Returns 0 for full ties so the
// caller's stable sort keeps the incoming order.
function comparator<T>(
  spec: SortFieldSpec<T>,
  direction: SortDirection,
): (a: T, b: T) => number {
  return (a, b) => {
    const aValue = spec.value(a);
    const bValue = spec.value(b);
    const aEmpty = isEmptyValue(aValue, spec.zeroIsEmpty);
    const bEmpty = isEmptyValue(bValue, spec.zeroIsEmpty);
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    if (!aEmpty && !bEmpty) {
      const primary = compareValues(aValue, bValue);
      if (primary !== 0) return direction === "desc" ? -primary : primary;
    }
    for (const tiebreaker of spec.tiebreakers ?? []) {
      const next = compareValues(tiebreaker(a), tiebreaker(b));
      if (next !== 0) return next;
    }
    return 0;
  };
}

export function sortItems<T, F extends string>(
  items: T[],
  sort: SortType<F>,
  specs: SortFieldSpecs<T, F>,
): T[] {
  const { field, direction } = parseSortType(sort);
  const spec = specs[field];
  const sorted = [...items];
  if (!spec) return sorted;
  if (spec.order) {
    return direction === "desc" ? sorted.reverse() : sorted;
  }
  return sorted.sort(comparator(spec, direction));
}

// Whether sorting by this field would mean anything for these items. Servers
// return every optional field (OpenSubsonic mandates it, even when empty) and
// the offline fallback carries only a subset, so coverage — not just the server
// type — decides which options are worth offering.
export function hasSortData<T>(items: T[], spec: SortFieldSpec<T>): boolean {
  if (spec.always || spec.order) return true;
  return items.some(
    (item) => !isEmptyValue(spec.value(item), spec.zeroIsEmpty),
  );
}

export function availableSortFields<T, F extends string>(
  items: T[],
  specs: SortFieldSpecs<T, F>,
  fields: F[],
  isEnabled?: (field: F) => boolean,
): F[] {
  return fields.filter(
    (field) =>
      (!isEnabled || isEnabled(field)) && hasSortData(items, specs[field]),
  );
}

// The sort to render with when the persisted one isn't currently available
// (e.g. a genre sort saved online, then browsed from the offline fallback).
// Deliberately does not write to the store, so the preference comes back with
// the data.
export function effectiveSort<F extends string>(
  sort: SortType<F>,
  available: F[],
  fallback: SortType<F>,
): SortType<F> {
  const { field } = parseSortType(sort);
  return available.includes(field) ? sort : fallback;
}
