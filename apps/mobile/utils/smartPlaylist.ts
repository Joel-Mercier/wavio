import * as z from "zod";
import type {
  SmartPlaylistCriteria,
  SmartPlaylistNode,
} from "@/services/navidrome/smartPlaylists";
import {
  supportsMultiFieldSort,
  supportsReplayGainCriteria,
  supportsTagPresenceOperators,
} from "@/utils/navidromeVersion";

export type FieldValueType =
  | "string"
  | "integer"
  | "decimal"
  | "rating"
  | "boolean"
  | "date"
  | "playlist";

export interface SmartPlaylistField {
  key: string;
  valueType: FieldValueType;
  i18nKey: string;
  // Server version (Navidrome) at which this criteria field became available.
  // Undefined = available on every version we support smart playlists on.
  minVersion?: "v062";
  // Tag/role (JSON-backed) field — supports the isMissing/isPresent operators.
  tagPresence?: boolean;
}

export const SMART_PLAYLIST_FIELDS: SmartPlaylistField[] = [
  { key: "title", valueType: "string", i18nKey: "title" },
  { key: "album", valueType: "string", i18nKey: "album" },
  { key: "artist", valueType: "string", i18nKey: "artist" },
  { key: "albumartist", valueType: "string", i18nKey: "albumartist" },
  { key: "genre", valueType: "string", i18nKey: "genre", tagPresence: true },
  { key: "comment", valueType: "string", i18nKey: "comment" },
  { key: "year", valueType: "integer", i18nKey: "year" },
  { key: "playcount", valueType: "integer", i18nKey: "playcount" },
  { key: "rating", valueType: "rating", i18nKey: "rating" },
  { key: "loved", valueType: "boolean", i18nKey: "loved" },
  { key: "dateadded", valueType: "date", i18nKey: "dateadded" },
  { key: "lastplayed", valueType: "date", i18nKey: "lastplayed" },
  { key: "bpm", valueType: "integer", i18nKey: "bpm" },
  { key: "duration", valueType: "integer", i18nKey: "duration" },
  // ReplayGain criteria, added in Navidrome v0.62.0.
  {
    key: "rgalbumgain",
    valueType: "decimal",
    i18nKey: "rgalbumgain",
    minVersion: "v062",
  },
  {
    key: "rgalbumpeak",
    valueType: "decimal",
    i18nKey: "rgalbumpeak",
    minVersion: "v062",
  },
  {
    key: "rgtrackgain",
    valueType: "decimal",
    i18nKey: "rgtrackgain",
    minVersion: "v062",
  },
  {
    key: "rgtrackpeak",
    valueType: "decimal",
    i18nKey: "rgtrackpeak",
    minVersion: "v062",
  },
];

// Fields available for the active server, hiding criteria the server is too old
// to understand so older Navidrome versions keep working.
export function getAvailableFields(
  serverVersion: string | null,
): SmartPlaylistField[] {
  const allowReplayGain = supportsReplayGainCriteria(serverVersion);
  return SMART_PLAYLIST_FIELDS.filter(
    (f) => f.minVersion !== "v062" || allowReplayGain,
  );
}

// Operators valid for a given field on the active server, appending the
// version-gated tag-presence operators for tag fields.
export function getOperatorsForField(
  field: SmartPlaylistField,
  serverVersion: string | null,
): RuleOperator[] {
  const base = OPERATORS_BY_VALUE_TYPE[field.valueType];
  if (field.tagPresence && supportsTagPresenceOperators(serverVersion)) {
    return [...base, "isMissing", "isPresent"];
  }
  return base;
}

export function isTagPresenceOperator(op: RuleOperator): boolean {
  return op === "isMissing" || op === "isPresent";
}

export const SMART_PLAYLIST_PLAYLIST_REFS: SmartPlaylistField[] = [
  { key: "id", valueType: "playlist", i18nKey: "inPlaylist" },
];

export const SORTABLE_FIELDS = [
  "title",
  "album",
  "artist",
  "albumartist",
  "genre",
  "year",
  "playcount",
  "rating",
  "dateadded",
  "lastplayed",
  "bpm",
  "duration",
  "random",
] as const;

export type SortableField = (typeof SORTABLE_FIELDS)[number];

export type RuleOperator =
  | "is"
  | "isNot"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "gt"
  | "lt"
  | "inTheRange"
  | "before"
  | "after"
  | "inTheLast"
  | "notInTheLast"
  | "inPlaylist"
  | "notInPlaylist"
  | "isMissing"
  | "isPresent";

export const OPERATORS_BY_VALUE_TYPE: Record<FieldValueType, RuleOperator[]> = {
  string: ["is", "isNot", "contains", "notContains", "startsWith", "endsWith"],
  integer: ["is", "isNot", "gt", "lt", "inTheRange"],
  decimal: ["is", "isNot", "gt", "lt", "inTheRange"],
  rating: ["is", "isNot", "gt", "lt", "inTheRange"],
  date: ["before", "after", "inTheLast", "notInTheLast"],
  boolean: ["is"],
  playlist: ["inPlaylist", "notInPlaylist"],
};

export const RULE_OPERATORS: RuleOperator[] = [
  "is",
  "isNot",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "gt",
  "lt",
  "inTheRange",
  "before",
  "after",
  "inTheLast",
  "notInTheLast",
  "inPlaylist",
  "notInPlaylist",
  "isMissing",
  "isPresent",
];

// Navidrome lowercases every operator and field key before matching it, so a
// criteria authored elsewhere may carry any casing; resolve back to ours.
export function getOperatorByKey(key: string): RuleOperator | undefined {
  const lower = key.toLowerCase();
  return RULE_OPERATORS.find((op) => op.toLowerCase() === lower);
}

// Playlist refs are searched too, so an inPlaylist/notInPlaylist rule read back
// from the server resolves to its own field rather than falling through as unknown.
export function getFieldByKey(key: string): SmartPlaylistField | undefined {
  const lower = key.toLowerCase();
  return [...SMART_PLAYLIST_FIELDS, ...SMART_PLAYLIST_PLAYLIST_REFS].find(
    (f) => f.key === lower,
  );
}

export interface FormRule {
  field: string;
  operator: RuleOperator;
  value: string;
  valueMax: string;
  boolValue: boolean;
  playlistId: string;
}

export interface FormRuleGroup {
  combinator: "all" | "any";
  rules: FormNode[];
}

export type FormNode = FormRule | FormRuleGroup;

export function isRuleGroup(node: FormNode): node is FormRuleGroup {
  return "rules" in node;
}

export interface FormSortEntry {
  field: SortableField;
  direction: "asc" | "desc";
}

// Presets offered for `refreshDelay`, in the duration syntax Navidrome parses
// (`utils.ParseDuration` extends Go durations with `d` = 24h and `w` = 168h).
// "" means "don't send the key", i.e. fall back to the server's global delay.
export const REFRESH_DELAY_PRESETS = [
  "",
  "1h",
  "6h",
  "12h",
  "1d",
  "1w",
] as const;

// Everything in a criteria blob the editor doesn't model, kept opaque and
// round-tripped verbatim: the server rewrites the whole blob from what we send,
// so a key we drop is gone from the playlist. Naming nothing means a key a
// future Navidrome adds survives an edit without a change here — today that
// covers `limitPercent` and `offset` authored in an .nsp file or Navidrome's
// own UI.
export type SmartPlaylistPassthrough = Record<string, unknown>;

export interface SmartPlaylistFormState {
  name: string;
  comment: string;
  isPublic: boolean;
  combinator: "all" | "any";
  rules: FormNode[];
  sorts: FormSortEntry[];
  limit: string;
  refreshDelay: string;
  passthrough?: SmartPlaylistPassthrough;
}

const ruleSchema = z
  .object({
    field: z.string().min(1),
    operator: z.string().min(1),
    value: z.string(),
    valueMax: z.string(),
    boolValue: z.boolean(),
    playlistId: z.string(),
  })
  .superRefine((rule, ctx) => {
    const field = getFieldByKey(rule.field);
    if (!field) return;
    const op = rule.operator as RuleOperator;
    if (field.valueType === "boolean") return;
    // isMissing/isPresent carry a boolean, not a typed value.
    if (isTagPresenceOperator(op)) return;
    if (field.valueType === "playlist") {
      if (!rule.playlistId)
        ctx.addIssue({
          code: "custom",
          message: "Playlist required",
          path: ["playlistId"],
        });
      return;
    }
    if (op === "inTheRange") {
      if (!rule.value || !rule.valueMax)
        ctx.addIssue({
          code: "custom",
          message: "Range values required",
          path: ["value"],
        });
      return;
    }
    if (!rule.value.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Value required",
        path: ["value"],
      });
    }
    if (
      (field.valueType === "integer" ||
        field.valueType === "decimal" ||
        field.valueType === "rating" ||
        op === "inTheLast" ||
        op === "notInTheLast") &&
      rule.value &&
      Number.isNaN(Number(rule.value))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Number required",
        path: ["value"],
      });
    }
  });

type SchemaNode =
  | z.infer<typeof ruleSchema>
  | { combinator: "all" | "any"; rules: SchemaNode[] };

const nodeSchema: z.ZodType<SchemaNode> = z.union([
  ruleSchema,
  z.object({
    combinator: z.enum(["all", "any"]),
    rules: z.lazy(() => z.array(nodeSchema).min(1)),
  }),
]);

export const smartPlaylistFormSchema = z.object({
  name: z.string().trim().min(1),
  comment: z.string().optional(),
  isPublic: z.boolean(),
  combinator: z.enum(["all", "any"]),
  rules: z.array(nodeSchema).min(1),
  sorts: z.array(
    z.object({
      field: z.string().min(1),
      direction: z.enum(["asc", "desc"]),
    }),
  ),
  limit: z.string().optional(),
  refreshDelay: z.string().optional(),
});

function coerceRuleValue(
  rule: FormRule,
): Record<string, never> | Record<string, unknown> | null {
  const field = getFieldByKey(rule.field);
  if (!field) return null;
  const op = rule.operator as RuleOperator;
  if (field.valueType === "playlist") {
    return { [op]: { id: rule.playlistId } } as Record<string, unknown>;
  }
  if (field.valueType === "boolean" || isTagPresenceOperator(op)) {
    return { [op]: { [field.key]: rule.boolValue } } as Record<string, unknown>;
  }
  if (op === "inTheRange") {
    const min = Number(rule.value);
    const max = Number(rule.valueMax);
    return {
      [op]: { [field.key]: [min, max] },
    } as Record<string, unknown>;
  }
  if (
    field.valueType === "integer" ||
    field.valueType === "decimal" ||
    field.valueType === "rating" ||
    op === "inTheLast" ||
    op === "notInTheLast"
  ) {
    return {
      [op]: { [field.key]: Number(rule.value) },
    } as Record<string, unknown>;
  }
  return {
    [op]: { [field.key]: rule.value },
  } as Record<string, unknown>;
}

function serializeNodes(nodes: FormNode[]): SmartPlaylistNode[] {
  return nodes.flatMap((node): SmartPlaylistNode[] => {
    if (!isRuleGroup(node)) {
      const rule = coerceRuleValue(node);
      return rule ? [rule as SmartPlaylistNode] : [];
    }
    const children = serializeNodes(node.rules);
    if (children.length === 0) return [];
    return [node.combinator === "any" ? { any: children } : { all: children }];
  });
}

export function toNavidromeCriteria(
  form: SmartPlaylistFormState,
  serverVersion: string | null,
): SmartPlaylistCriteria {
  const rules = serializeNodes(form.rules);

  // Seeded with the unmodeled keys first, so the ones the editor owns always win
  // over a stale copy of themselves. Ungated on the server version: a server too
  // old to understand a key never sent it back in the first place, and dropping
  // one we did read is the data loss this guards against.
  const criteria: SmartPlaylistCriteria = { ...form.passthrough };
  if (form.combinator === "any") {
    criteria.any = rules;
  } else {
    criteria.all = rules;
  }

  if (form.sorts.length > 0) {
    const allowMulti = supportsMultiFieldSort(serverVersion);
    const sorts = allowMulti ? form.sorts : form.sorts.slice(0, 1);
    criteria.sort = sorts.map((s) => s.field).join(",");
    criteria.order = sorts.map((s) => s.direction).join(",");
  }

  if (form.limit && form.limit.trim().length > 0) {
    const limit = Number(form.limit);
    if (!Number.isNaN(limit) && limit > 0) criteria.limit = Math.floor(limit);
  }

  // Not gated on the server version either: `supportsRefreshDelay` decides
  // whether the *editor* offers the control, but a value we read back has to
  // survive a save regardless — including when the version string is unknown on
  // a server new enough to have sent one.
  if (form.refreshDelay) {
    criteria.refreshDelay = form.refreshDelay;
  }

  return criteria;
}

// Rules and nested `all`/`any` groups parse to any depth, so a criteria authored
// elsewhere (an .nsp file, another client) round-trips instead of being dropped.
function parseNodes(nodes: SmartPlaylistNode[]): FormNode[] {
  return nodes.flatMap((node): FormNode[] => {
    const key = Object.keys(node)[0];
    if (!key) return [];
    const conjunction = key.toLowerCase();
    if (conjunction === "all" || conjunction === "any") {
      const children = (node as Record<string, SmartPlaylistNode[]>)[key];
      if (!Array.isArray(children)) return [];
      const rules = parseNodes(children);
      // A group left with nothing we can model is dropped like an unknown rule:
      // kept, it would serialize back to a conjunction the server rejects.
      if (rules.length === 0) return [];
      return [{ combinator: conjunction, rules }];
    }
    const op = getOperatorByKey(key);
    if (!op) return [];
    const payload = (node as Record<string, Record<string, unknown>>)[key];
    if (!payload) return [];
    if (op === "inPlaylist" || op === "notInPlaylist") {
      const id = String(payload.id ?? "");
      return [
        {
          field: SMART_PLAYLIST_PLAYLIST_REFS[0].key,
          operator: op,
          value: "",
          valueMax: "",
          boolValue: false,
          playlistId: id,
        },
      ];
    }
    const fieldKey = Object.keys(payload)[0];
    const fieldDef = getFieldByKey(fieldKey);
    if (!fieldDef) return [];
    const raw = payload[fieldKey];
    if (fieldDef.valueType === "boolean" || isTagPresenceOperator(op)) {
      return [
        {
          field: fieldDef.key,
          operator: op,
          value: "",
          valueMax: "",
          boolValue: Boolean(raw),
          playlistId: "",
        },
      ];
    }
    if (op === "inTheRange" && Array.isArray(raw)) {
      return [
        {
          field: fieldDef.key,
          operator: op,
          value: String(raw[0] ?? ""),
          valueMax: String(raw[1] ?? ""),
          boolValue: false,
          playlistId: "",
        },
      ];
    }
    return [
      {
        field: fieldDef.key,
        operator: op,
        value: String(raw ?? ""),
        valueMax: "",
        boolValue: false,
        playlistId: "",
      },
    ];
  });
}

export function fromNavidromeCriteria(
  criteria: SmartPlaylistCriteria | null | undefined,
): Pick<
  SmartPlaylistFormState,
  "combinator" | "rules" | "sorts" | "limit" | "refreshDelay" | "passthrough"
> {
  const combinator: "all" | "any" = criteria?.any ? "any" : "all";
  const rawRules = combinator === "any" ? criteria?.any : criteria?.all;
  const rules = parseNodes(rawRules ?? []);

  const sortFields = (criteria?.sort ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const orderFields = (criteria?.order ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const sorts: FormSortEntry[] = sortFields.map((field, i) => ({
    field: field as SortableField,
    direction: (orderFields[i] === "desc" ? "desc" : "asc") as "asc" | "desc",
  }));

  const {
    all: _all,
    any: _any,
    sort: _sort,
    order: _order,
    limit: _limit,
    refreshDelay: _refreshDelay,
    ...passthrough
  } = criteria ?? ({} as SmartPlaylistCriteria);

  return {
    combinator,
    rules,
    sorts,
    limit: criteria?.limit ? String(criteria.limit) : "",
    refreshDelay: criteria?.refreshDelay ?? "",
    passthrough,
  };
}

export function defaultRuleGroup(): FormRuleGroup {
  return { combinator: "any", rules: [defaultRule()] };
}

export function defaultRule(): FormRule {
  return {
    field: "title",
    operator: "contains",
    value: "",
    valueMax: "",
    boolValue: false,
    playlistId: "",
  };
}
