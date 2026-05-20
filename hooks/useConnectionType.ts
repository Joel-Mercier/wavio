import NetInfo, {
  type NetInfoStateType,
} from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useConnectionType() {
  const [type, setType] = useState<NetInfoStateType>(
    "unknown" as NetInfoStateType,
  );
  useEffect(() => {
    let cancelled = false;
    NetInfo.fetch().then((state) => {
      if (!cancelled) setType(state.type);
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      setType(state.type);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return type;
}
