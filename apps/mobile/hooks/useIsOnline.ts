import { useSyncExternalStore } from "react";
import {
  getConnectionType,
  getIsEffectivelyOnline,
  getIsOnline,
  subscribeConnectionType,
  subscribeEffectiveOnline,
  subscribeIsOnline,
} from "@/services/network";

// Reads the shared connectivity singleton (services/network.ts) instead of
// creating its own NetInfo listener. This matters because useIsOnline is called
// per row in TrackListItem — a dedicated listener + fetch per row meant native
// subscription churn on every FlashList recycle. The singleton's single
// persistent listener (wired once at root via initConnectionType) keeps the
// cached value fresh, so rows mounting later read the current state without an
// extra fetch.
//
// Returns *effective* connectivity: the device is online AND the active server
// is reachable. This is what almost all UI cares about (can we fetch/stream?).
export function useIsOnline() {
  return useSyncExternalStore(subscribeEffectiveOnline, getIsEffectivelyOnline);
}

// Raw device connectivity, ignoring server reachability. Rarely needed — use
// this only when you must distinguish "no internet" from "server unreachable"
// (e.g. the offline banner copy).
export function useIsDeviceOnline() {
  return useSyncExternalStore(subscribeIsOnline, getIsOnline);
}

// Current transport type (e.g. "wifi" / "cellular"), from the same singleton.
// Used to react to WiFi↔cellular handoffs where the effective stream bitrate cap
// (getEffectiveMaxBitRate) changes.
export function useConnectionType() {
  return useSyncExternalStore(subscribeConnectionType, getConnectionType);
}
