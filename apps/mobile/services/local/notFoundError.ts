/**
 * The id is well formed, but nothing in the local index has it (any more).
 * Named like LocalUnsupportedError, which error reporting already treats as
 * expected, and kept apart from it so checking for it loads no i18n.
 */
export class LocalNotFoundError extends Error {
  constructor(what: string) {
    super(`The local library does not have ${what} (not indexed)`);
    this.name = "LocalUnsupportedError";
  }
}
