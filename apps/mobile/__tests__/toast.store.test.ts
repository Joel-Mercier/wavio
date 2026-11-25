jest.mock("@gluestack-ui/core/overlay/creator", () => ({
  Overlay: ({ children }: { children: unknown }) => children,
}));
jest.mock("@gluestack-ui/utils/hooks", () => ({
  useKeyboardBottomInset: () => 0,
}));
jest.mock("react-native-safe-area-context", () => ({
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: ({ children }: { children: unknown }) => children,
}));

import * as React from "react";
import TestRenderer from "react-test-renderer";
import {
  exitToast,
  useToast,
  useToastStore,
} from "@/components/ui/toast/store";
import { ToastList } from "@/components/ui/toast/ToastList";

const render = () => React.createElement("toast");
const state = () => useToastStore.getState();

beforeEach(() => {
  jest.useFakeTimers();
  useToast().closeAll();
  useToastStore.setState({ toastInfo: {}, visibleToasts: {} });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("toast store", () => {
  test("show queues the toast under its placement and makes it visible", () => {
    const id = useToast().show({ placement: "top", render });
    expect(state().toastInfo.top?.map((toast) => toast.id)).toEqual([id]);
    expect(state().visibleToasts[id]).toBe(true);
    expect(useToast().isActive(id)).toBe(true);
  });

  test("defaults to the bottom placement and hides after 5 s", () => {
    const id = useToast().show({ render });
    expect(state().toastInfo.bottom).toHaveLength(1);
    jest.advanceTimersByTime(4999);
    expect(state().visibleToasts[id]).toBe(true);
    jest.advanceTimersByTime(1);
    expect(state().visibleToasts[id]).toBe(false);
  });

  test("a null duration never hides", () => {
    const id = useToast().show({ render, duration: null });
    jest.advanceTimersByTime(60_000);
    expect(state().visibleToasts[id]).toBe(true);
  });

  test("showing an existing id replaces it", () => {
    const toast = useToast();
    toast.show({ id: "undo", placement: "top", render });
    toast.show({ id: "undo", placement: "bottom", render });
    expect(state().toastInfo.top).toHaveLength(0);
    expect(state().toastInfo.bottom).toHaveLength(1);
  });

  test("a re-shown id gets its own full duration", () => {
    const toast = useToast();
    toast.show({ id: "undo", render, duration: 5000 });
    jest.advanceTimersByTime(4000);
    toast.show({ id: "undo", render, duration: 5000 });
    jest.advanceTimersByTime(4999);
    expect(state().visibleToasts.undo).toBe(true);
    jest.advanceTimersByTime(1);
    expect(state().visibleToasts.undo).toBe(false);
  });

  test("a re-shown id with no duration outlives the earlier timer", () => {
    const toast = useToast();
    toast.show({ id: "undo", render, duration: 5000 });
    toast.show({ id: "undo", render, duration: null });
    jest.advanceTimersByTime(60_000);
    expect(state().visibleToasts.undo).toBe(true);
  });

  test("render receives the toast id", () => {
    const renderToast = jest.fn(render);
    const id = useToast().show({ render: renderToast });
    expect(renderToast).toHaveBeenCalledWith({ id });
  });

  test("exit drops a hidden toast with its visibility entry", () => {
    const onCloseComplete = jest.fn();
    const toast = useToast();
    const id = toast.show({ render, onCloseComplete });
    toast.close(id);
    expect(toast.isActive(id)).toBe(true);
    exitToast(id);
    expect(toast.isActive(id)).toBe(false);
    expect(id in state().visibleToasts).toBe(false);
    expect(onCloseComplete).toHaveBeenCalledTimes(1);
  });

  test("exit leaves a toast that was shown again before it finished", () => {
    const onCloseComplete = jest.fn();
    const toast = useToast();
    toast.show({ id: "x", render, onCloseComplete });
    toast.close("x");
    toast.show({ id: "x", render, onCloseComplete });
    exitToast("x");
    expect(toast.isActive("x")).toBe(true);
    expect(onCloseComplete).not.toHaveBeenCalled();
  });

  test("closing an unknown or already hidden toast writes nothing", () => {
    const toast = useToast();
    const id = toast.show({ render });
    toast.close(id);
    const hidden = state();
    toast.close(id);
    toast.close("gone");
    expect(state()).toBe(hidden);
  });

  test("closeAll hides every toast", () => {
    const toast = useToast();
    const first = toast.show({ render, duration: null });
    const second = toast.show({ render, duration: null });
    toast.closeAll();
    expect(state().visibleToasts[first]).toBeUndefined();
    expect(state().visibleToasts[second]).toBeUndefined();
    expect(toast.isActive(first)).toBe(true);
  });

  test("components using useToast don't re-render when toasts change", () => {
    let renders = 0;
    let toast: ReturnType<typeof useToast> | undefined;
    const Consumer = () => {
      renders++;
      toast = useToast();
      return null;
    };
    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(Consumer));
    });
    const mounted = toast;
    TestRenderer.act(() => {
      useToast().close(useToast().show({ render }));
    });
    expect(renders).toBe(1);
    expect(useToast()).toBe(mounted);
  });
});

describe("ToastList", () => {
  let root: TestRenderer.ReactTestRenderer | undefined;
  const mount = () => {
    TestRenderer.act(() => {
      root = TestRenderer.create(React.createElement(ToastList));
    });
  };

  afterEach(() => {
    TestRenderer.act(() => root?.unmount());
    root = undefined;
  });

  test("removes a toast once its exit animation has run", () => {
    mount();
    let id = "";
    TestRenderer.act(() => {
      id = useToast().show({ render, duration: null });
    });
    TestRenderer.act(() => {
      useToast().close(id);
    });
    expect(useToast().isActive(id)).toBe(true);
    TestRenderer.act(() => {
      jest.runAllTimers();
    });
    expect(useToast().isActive(id)).toBe(false);
  });

  test("removes a toast closed before it was ever shown", () => {
    mount();
    let id = "";
    TestRenderer.act(() => {
      id = useToast().show({ render });
      useToast().close(id);
    });
    expect(useToast().isActive(id)).toBe(false);
  });

  test("keeps a toast shown again while it was leaving", () => {
    mount();
    TestRenderer.act(() => {
      useToast().show({ id: "x", render, duration: null });
    });
    TestRenderer.act(() => {
      useToast().close("x");
    });
    TestRenderer.act(() => {
      useToast().show({ id: "x", render, duration: null });
    });
    TestRenderer.act(() => {
      jest.runAllTimers();
    });
    expect(useToast().isActive("x")).toBe(true);
    expect(state().visibleToasts.x).toBe(true);
  });
});
