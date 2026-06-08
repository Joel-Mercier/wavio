import * as z from "zod";
import type {
  SmartPlaylistCriteria,
  SmartPlaylistRule,
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

export function getFieldByKey(key: string): SmartPlaylistField | undefined {
  return SMART_PLAYLIST_FIELDS.find((f) => f.key === key);
}

export interface FormRule {
  field: string;
  operator: RuleOperator;
  value: string;
  valueMax: string;
  boolValue: boolean;
  playlistId: string;
}

export interface FormSortEntry {
  field: SortableField;
  direction: "asc" | "desc";
}

export interface SmartPlaylistFormState {
  name: string;
  comment: string;
  isPublic: boolean;
  combinator: "all" | "any";
  rules: FormRule[];
  sorts: FormSortEntry[];
  limit: string;
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

export const smartPlaylistFormSchema = z.object({
  name: z.string().trim().min(1),
  comment: z.string().optional(),
  isPublic: z.boolean(),
  combinator: z.enum(["all", "any"]),
  rules: z.array(ruleSchema).min(1),
  sorts: z.array(
    z.object({
      field: z.string().min(1),
      direction: z.enum(["asc", "desc"]),
    }),
  ),
  limit: z.string().optional(),
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

export function toNavidromeCriteria(
  form: SmartPlaylistFormState,
  serverVersion: string | null,
): SmartPlaylistCriteria {
  const rules = form.rules
    .map(coerceRuleValue)
    .filter((r): r is SmartPlaylistRule => r !== null);

  const criteria: SmartPlaylistCriteria = {};
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

  return criteria;
}

export function fromNavidromeCriteria(
  criteria: SmartPlaylistCriteria | null | undefined,
): Pick<SmartPlaylistFormState, "combinator" | "rules" | "sorts" | "limit"> {
  const combinator: "all" | "any" = criteria?.any ? "any" : "all";
  const rawRules = combinator === "any" ? criteria?.any : criteria?.all;
  const rules: FormRule[] = (rawRules ?? []).flatMap((rule): FormRule[] => {
    const op = Object.keys(rule)[0] as RuleOperator | undefined;
    if (!op) return [];
    const payload = (rule as Record<string, Record<string, unknown>>)[op];
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
          field: fieldKey,
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
          field: fieldKey,
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
        field: fieldKey,
        operator: op,
        value: String(raw ?? ""),
        valueMax: "",
        boolValue: false,
        playlistId: "",
      },
    ];
  });

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

  return {
    combinator,
    rules,
    sorts,
    limit: criteria?.limit ? String(criteria.limit) : "",
  };
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
