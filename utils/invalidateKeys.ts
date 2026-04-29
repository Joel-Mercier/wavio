import type { QueryClient } from "@tanstack/react-query";

export function invalidateKeys(
  queryClient: QueryClient,
  queryKeys: readonly (readonly unknown[])[],
) {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      queryKeys.some(
        (key) =>
          query.queryKey.length >= key.length &&
          key.every((k, i) => query.queryKey[i] === k),
      ),
  });
}
