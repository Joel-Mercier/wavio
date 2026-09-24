import { Platform } from "react-native";
import { CarAutoBridge } from "@/services/carAuto/bridge";
import {
  isCarPlayConnected,
  onCarPlayConnection,
} from "@/services/carAuto/carplay";

export const isCarConnected = () =>
  Platform.OS === "ios" ? isCarPlayConnected() : CarAutoBridge.isCarConnected();

export const subscribeCarConnection = (
  listener: (connected: boolean) => void,
) =>
  Platform.OS === "ios"
    ? onCarPlayConnection(listener)
    : CarAutoBridge.onCarConnection(listener);
