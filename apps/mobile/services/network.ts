import NetInfo, {
  type NetInfoState,
  type NetInfoStateType,
} from "@react-native-community/netinfo";

let currentType: NetInfoStateType = "unknown" as NetInfoStateType;
// Optimistic default — matches the previous per-component useIsOnline behavior
// of assuming online until the first NetInfo result arrives.
let isOnline = true;

const typeListeners = new Set<(type: NetInfoStateType) => void>();
const onlineListeners = new Set<() => void>();

export function getConnectionType(): NetInfoStateType {
  return currentType;
}

export function getIsOnline(): boolean {
  return isOnline;
}

export function subscribeConnectionType(
  cb: (type: NetInfoStateType) => void,
): () => void {
  typeListeners.add(cb);
  return () => {
    typeListeners.delete(cb);
  };
}

// Parameterless callback to match the useSyncExternalStore contract — consumers
// read the current value via getIsOnline().
export function subscribeIsOnline(cb: () => void): () => void {
  onlineListeners.add(cb);
  return () => {
    onlineListeners.delete(cb);
  };
}

function applyState(state: NetInfoState) {
  if (state.type !== currentType) {
    currentType = state.type;
    for (const cb of typeListeners) cb(currentType);
  }
  const nextOnline = !!state.isConnected;
  if (nextOnline !== isOnline) {
    isOnline = nextOnline;
    for (const cb of onlineListeners) cb();
  }
}

export function initConnectionType(): () => void {
  NetInfo.fetch().then(applyState);
  return NetInfo.addEventListener(applyState);
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
