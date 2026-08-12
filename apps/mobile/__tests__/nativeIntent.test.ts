const authState = { isAuthenticated: true };

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => authState },
}));

import { redirectSystemPath } from "@/app/+native-intent";
import { consumePendingHref } from "@/utils/navigation";

describe("redirectSystemPath", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    consumePendingHref();
  });

  it("maps shortcut URLs to their routes", () => {
    expect(
      redirectSystemPath({ path: "wavio://shortcuts/search", initial: true }),
    ).toBe("/recent-searches");
    expect(
      redirectSystemPath({ path: "wavio://shortcuts/library", initial: true }),
    ).toBe("/(app)/(tabs)/(library)");
    expect(
      redirectSystemPath({ path: "wavio://shortcuts/queue", initial: true }),
    ).toBe("/queue");
  });

  it("maps a bare path, as delivered to a running app", () => {
    expect(
      redirectSystemPath({ path: "/shortcuts/queue", initial: false }),
    ).toBe("/queue");
  });

  it("passes other deep links through untouched", () => {
    for (const path of [
      "wavio://albums/123",
      "wavio://player",
      "wavio://shortcuts/bogus",
      "/favorites",
    ]) {
      expect(redirectSystemPath({ path, initial: true })).toBe(path);
    }
  });

  it("parks the target for after login only when signed out", () => {
    redirectSystemPath({ path: "wavio://shortcuts/queue", initial: true });
    expect(consumePendingHref()).toBeNull();

    authState.isAuthenticated = false;
    redirectSystemPath({ path: "wavio://shortcuts/queue", initial: true });
    expect(consumePendingHref()).toBe("/queue");
  });

  it("clears the parked target once consumed", () => {
    authState.isAuthenticated = false;
    redirectSystemPath({ path: "wavio://shortcuts/search", initial: true });
    expect(consumePendingHref()).toBe("/recent-searches");
    expect(consumePendingHref()).toBeNull();
  });
});
