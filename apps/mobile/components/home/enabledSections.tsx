import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

// Which feed sections are allowed to run their queries, held outside React.
//
// The gate has to live here rather than in the feed's renderItem: FlashList's
// ViewHolder memo compares renderItem by reference, so a renderItem closing
// over an advancing index re-renders every mounted section on every scroll
// viewability event — the whole visible feed, synchronously, mid-scroll. Going
// through an external store keeps renderItem stable and wakes only the sections
// whose own gate actually flips.
export interface EnabledSectionsStore {
  getEnabledThrough: () => number;
  advanceTo: (index: number) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createEnabledSectionsStore(
  initialIndex: number,
): EnabledSectionsStore {
  // Monotonic: an enabled section never goes back to disabled, so the feed
  // never tears down content it already loaded.
  let enabledThrough = initialIndex;
  const listeners = new Set<() => void>();
  return {
    getEnabledThrough: () => enabledThrough,
    advanceTo: (index: number) => {
      if (index <= enabledThrough) return;
      enabledThrough = index;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const EnabledSectionsContext = createContext<EnabledSectionsStore | null>(null);

export function EnabledSectionsProvider({
  store,
  children,
}: {
  store: EnabledSectionsStore;
  children: ReactNode;
}) {
  return (
    <EnabledSectionsContext.Provider value={store}>
      {children}
    </EnabledSectionsContext.Provider>
  );
}

const noopUnsubscribe = () => {};

// Outside a provider every section is enabled — a section rendered on its own
// should fetch, not sit on a skeleton forever.
export function useSectionEnabled(sectionIndex: number): boolean {
  const store = useContext(EnabledSectionsContext);

  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? noopUnsubscribe,
    [store],
  );

  const getSnapshot = useCallback(
    () => (store ? sectionIndex <= store.getEnabledThrough() : true),
    [store, sectionIndex],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
