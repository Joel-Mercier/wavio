import NetInfo, {
  type NetInfoStateType,
} from "@react-native-community/netinfo";

let currentType: NetInfoStateType = "unknown" as NetInfoStateType;
const listeners = new Set<(type: NetInfoStateType) => void>();

export function getConnectionType(): NetInfoStateType {
  return currentType;
}

export function subscribeConnectionType(
  cb: (type: NetInfoStateType) => void,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function initConnectionType(): () => void {
  NetInfo.fetch().then((state) => {
    if (state.type !== currentType) {
      currentType = state.type;
      for (const cb of listeners) cb(currentType);
    }
  });
  return NetInfo.addEventListener((state) => {
    if (state.type !== currentType) {
      currentType = state.type;
      for (const cb of listeners) cb(currentType);
    }
  });
}

export function getEffectiveMaxBitRate(
  maxBitRate: number | null,
  cellularMaxBitRate: number | null,
): number | null {
  if (currentType !== "cellular") return maxBitRate;
  if (maxBitRate != null && cellularMaxBitRate != null) {
    return Math.min(maxBitRate, cellularMaxBitRate);
  }
  return cellularMaxBitRate ?? maxBitRate;
}
