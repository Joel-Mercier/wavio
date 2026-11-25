import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { create } from "zustand";

export type ToastPlacement =
  | "top"
  | "top right"
  | "top left"
  | "bottom"
  | "bottom left"
  | "bottom right";

export interface ToastOptions {
  id?: string;
  placement?: ToastPlacement;
  duration?: number | null;
  render?: (props: { id: string }) => ReactNode;
  avoidKeyboard?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  onCloseComplete?: () => void;
}

export interface ToastEntry {
  id: string;
  component: ReactNode;
  config: ToastOptions;
}

interface ToastState {
  toastInfo: Partial<Record<ToastPlacement, ToastEntry[]>>;
  visibleToasts: Record<string, boolean>;
}

export const useToastStore = create<ToastState>(() => ({
  toastInfo: {},
  visibleToasts: {},
}));

const DEFAULT_DURATION = 5000;
let nextToastId = 1;
const hideTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearHideTimer(id: string) {
  const timer = hideTimers.get(id);
  if (timer === undefined) return;
  clearTimeout(timer);
  hideTimers.delete(id);
}

function findToast(id: string): ToastEntry | undefined {
  for (const toasts of Object.values(useToastStore.getState().toastInfo)) {
    const toast = toasts?.find((entry) => entry.id === id);
    if (toast) return toast;
  }
  return undefined;
}

function isToastActive(id: string) {
  return findToast(id) !== undefined;
}

function hideToast(id: string) {
  clearHideTimer(id);
  if (!isToastActive(id)) return;
  if (useToastStore.getState().visibleToasts[id] === false) return;
  useToastStore.setState((state) => ({
    visibleToasts: { ...state.visibleToasts, [id]: false },
  }));
}

function hideAllToasts() {
  for (const timer of hideTimers.values()) clearTimeout(timer);
  hideTimers.clear();
  useToastStore.setState({ visibleToasts: {} });
}

export function exitToast(id: string) {
  const toast = findToast(id);
  if (!toast || useToastStore.getState().visibleToasts[id]) return;
  clearHideTimer(id);
  useToastStore.setState((state) => {
    const toastInfo = { ...state.toastInfo };
    for (const [placement, toasts] of Object.entries(toastInfo)) {
      toastInfo[placement as ToastPlacement] = toasts?.filter(
        (entry) => entry.id !== id,
      );
    }
    const { [id]: _exited, ...visibleToasts } = state.visibleToasts;
    return { toastInfo, visibleToasts };
  });
  toast.config.onCloseComplete?.();
}

function showToast(options: ToastOptions): string {
  const {
    placement = "bottom",
    render,
    id = `${nextToastId++}`,
    duration = DEFAULT_DURATION,
  } = options;
  if (!render) return id;

  const component = render({ id });
  clearHideTimer(id);
  useToastStore.setState((state) => {
    const toastInfo = { ...state.toastInfo };
    for (const [key, toasts] of Object.entries(toastInfo)) {
      toastInfo[key as ToastPlacement] = toasts?.filter(
        (entry) => entry.id !== id,
      );
    }
    toastInfo[placement] = [
      ...(toastInfo[placement] ?? []),
      { component, id, config: options },
    ];
    return {
      toastInfo,
      visibleToasts: { ...state.visibleToasts, [id]: true },
    };
  });
  if (duration !== null) {
    hideTimers.set(
      id,
      setTimeout(() => hideToast(id), duration),
    );
  }
  return id;
}

const toast = {
  show: showToast,
  close: hideToast,
  closeAll: hideAllToasts,
  isActive: isToastActive,
};

export function useToast() {
  return toast;
}
