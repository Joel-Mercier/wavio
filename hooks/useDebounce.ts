import { useCallback, useRef } from "react";

const DEFAULT_TIMEOUT = 250;

type Callback = () => void;
type Timeout = ReturnType<typeof setTimeout>;

export type Debounce = (callback: Callback) => void;

export type UseDebounce = (timeout?: number) => Debounce;

const useDebounce: UseDebounce = (timeout = DEFAULT_TIMEOUT) => {
  const timeoutRef = useRef<Timeout>(0 as unknown as Timeout);

  return useCallback(
    (callback: Callback) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(callback, timeout);
    },
    [timeout],
  );
};

export default useDebounce;
