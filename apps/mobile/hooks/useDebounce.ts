import { useCallback, useEffect, useMemo, useRef } from "react";

const DEFAULT_TIMEOUT = 250;

type Callback = () => void;
type Timeout = ReturnType<typeof setTimeout>;

export type Debounce = ((callback: Callback) => void) & { cancel: () => void };

export type UseDebounce = (timeout?: number) => Debounce;

const useDebounce: UseDebounce = (timeout = DEFAULT_TIMEOUT) => {
  const timeoutRef = useRef<Timeout | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // A pending callback outlives the screen otherwise, firing a state update on
  // a component that is already gone.
  useEffect(() => cancel, [cancel]);

  return useMemo(
    () =>
      Object.assign(
        (callback: Callback) => {
          cancel();
          timeoutRef.current = setTimeout(callback, timeout);
        },
        { cancel },
      ),
    [timeout, cancel],
  );
};

export default useDebounce;
