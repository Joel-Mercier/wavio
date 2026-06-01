import { useSyncExternalStore } from "react";
import { getIsOnline, subscribeIsOnline } from "@/services/network";

// Reads the shared connectivity singleton (services/network.ts) instead of
// creating its own NetInfo listener. This matters because useIsOnline is called
// per row in TrackListItem — a dedicated listener + fetch per row meant native
// subscription churn on every FlashList recycle. The singleton's single
// persistent listener (wired once at root via initConnectionType) keeps the
// cached value fresh, so rows mounting later read the current state without an
// extra fetch.
export function useIsOnline() {
  return useSyncExternalStore(subscribeIsOnline, getIsOnline);
}
