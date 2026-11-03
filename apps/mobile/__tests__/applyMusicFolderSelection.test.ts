// Switching libraries must cost one round of requests: the incoming selection's
// queries, never a refetch of the outgoing one (whose queries are still the
// active ones at the moment the selection is applied, before React re-renders).
const mockAuthState: { scope: string | undefined } = { scope: "scope" };
jest.mock("@/stores/auth", () => ({
  useCurrentAuthScope: () => mockAuthState.scope,
}));
jest.mock("@/config/storage", () => ({
  zustandStorage: {
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  },
}));

import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import * as React from "react";
import TestRenderer from "react-test-renderer";
import useApplyMusicFolderSelection from "@/hooks/useApplyMusicFolderSelection";
import {
  type MusicFolderSelection,
  useMusicFoldersBase,
} from "@/stores/musicFolders";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const renderApply = (queryClient: QueryClient) => {
  let apply!: (ids: MusicFolderSelection) => void;
  const Probe = () => {
    apply = useApplyMusicFolderSelection();
    return null;
  };
  TestRenderer.act(() => {
    TestRenderer.create(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(Probe),
      ),
    );
  });
  return apply;
};

describe("useApplyMusicFolderSelection", () => {
  beforeEach(() => {
    useMusicFoldersBase.setState({ selections: {} });
  });

  it("stores the selection and refetches only the incoming keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
    });
    const fetched: string[] = [];
    const options = (ids: MusicFolderSelection) => ({
      queryKey: ["albumList2", { musicFolderIds: ids }],
      queryFn: () => {
        fetched.push(ids?.join("+") ?? "all");
        return ids ?? [];
      },
    });

    // Visited before, so the incoming selection is already cached and fresh.
    await queryClient.prefetchQuery(options(["2", "3"]));
    const observer = new QueryObserver(queryClient, options(undefined));
    const unsubscribe = observer.subscribe(() => {});
    await flush();
    fetched.length = 0;

    const apply = renderApply(queryClient);
    apply(["2", "3"]);
    await flush();
    expect(fetched).toEqual([]);
    expect(useMusicFoldersBase.getState().selections).toEqual({
      scope: ["2", "3"],
    });

    observer.setOptions(options(["2", "3"]));
    await flush();
    expect(fetched).toEqual(["2+3"]);

    unsubscribe();
    queryClient.clear();
  });
});
