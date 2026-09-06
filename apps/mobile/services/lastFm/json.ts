/**
 * Readers for the two shapes every Last.fm JSON response is built from.
 *
 * `format=json` was bolted onto an XML API and still behaves like one: a
 * collection with a single member comes back as a bare object rather than a
 * one-element array, and every `@attr` number is a string. Both are undocumented
 * and both are the classic way a client crashes on the one account that happens
 * to have exactly one result.
 */

export const toEntries = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

export const toCount = (
  value: string | number | undefined,
  fallback: number,
): number => (value === undefined ? fallback : Number(value) || 0);
