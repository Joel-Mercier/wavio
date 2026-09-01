/**
 * Every list endpoint on Navidrome's native API returns a bare JSON array, so
 * callers map/filter the body directly. `?? []` is not enough of a guard: a
 * reverse proxy — or Navidrome itself erroring — can answer HTTP 200 with an
 * HTML page or a `{error}` object, and a truthy non-array then reaches `.filter`
 * as `TypeError: undefined is not a function` from deep inside a mapper, with
 * nothing in the trace pointing at the body (Sentry WAVIO-GM, 16 users).
 *
 * An unusable body means the same thing as no results, so resolve it to an empty
 * list at the service boundary, while the shape is still known.
 *
 * Deliberately a leaf module rather than a member of `services/navidrome/index`:
 * the section files mock that module to stub the axios instance, which would
 * shadow this away exactly where it is being tested.
 */
export function asList<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}
