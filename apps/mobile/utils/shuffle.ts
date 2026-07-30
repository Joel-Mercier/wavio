// Tiny deterministic PRNG so the same seed produces the same sequence.
export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Seeded shuffle convenience — stable picks for a given (array, seed).
export function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  return shuffle(arr, mulberry32(seed || 1));
}

// A uniform shuffle regularly clusters several tracks by the same artist, which
// reads as "not shuffled at all" on the playlists people shuffle most. This
// spreads each group evenly across the output instead of drawing positions
// independently: a group of n items in a list of N is laid out every N/n slots,
// starting at a random offset, with a little jitter so the grid isn't audible.
// Sorting those positions interleaves the groups.
//
// `keyOf` returning undefined means "belongs to no group" — such items each get
// their own group so untagged tracks stay independent of one another.
export function dispersedShuffle<T>(
  items: T[],
  keyOf: (item: T) => string | undefined,
  rand: () => number = Math.random,
): T[] {
  if (items.length < 3) return shuffle(items, rand);

  const groups = new Map<string, T[]>();
  items.forEach((item, index) => {
    const itemKey = keyOf(item);
    // Prefixed so a solo item can never land in a real group's bucket.
    const key = itemKey === undefined ? `solo:${index}` : `key:${itemKey}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  });

  const total = items.length;
  const placed: { item: T; position: number }[] = [];
  for (const group of groups.values()) {
    const spacing = total / group.length;
    const offset = rand() * spacing;
    shuffle(group, rand).forEach((item, i) => {
      placed.push({
        item,
        position: offset + i * spacing + (rand() - 0.5) * spacing * 0.2,
      });
    });
  }

  return placed.sort((a, b) => a.position - b.position).map((p) => p.item);
}
