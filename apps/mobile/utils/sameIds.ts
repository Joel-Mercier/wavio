/** Whether both lists hold the same ids in the same order. */
export function sameIds(
  a: readonly string[] | null | undefined,
  b: readonly string[],
): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
