import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    let cancelled = false;
    NetInfo.fetch().then((state) => {
      if (!cancelled) setIsOnline(!!state.isConnected);
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return isOnline;
}
