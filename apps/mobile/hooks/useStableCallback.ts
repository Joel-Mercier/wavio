import { useCallback, useRef } from "react";

// biome-ignore lint/suspicious/noExplicitAny: generic callback signature
type AnyCallback = (...args: any[]) => any;

/**
 * Returns a callback whose identity never changes while always invoking the
 * latest closure. Needed for props FlashList compares by reference
 * (`renderItem`, `CellRendererComponent`) and for callbacks captured inside
 * gesture worklets, where a new identity re-registers the handler.
 *
 * The ref is updated during render, not in an effect: FlashList calls
 * `renderItem` while rendering, so a closure refreshed only after commit would
 * render one pass behind whenever `extraData` changes.
 */
export default function useStableCallback<T extends AnyCallback>(callback: T) {
  const latest = useRef(callback);
  latest.current = callback;

  return useCallback(
    (...args: Parameters<T>): ReturnType<T> => latest.current(...args),
    [],
  );
}
