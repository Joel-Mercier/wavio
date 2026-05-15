jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: {
      setItem: (k: string, v: string) => mem.set(k, v),
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    },
  };
});

import { loginSchema, useAuthBase } from "@/stores/auth";

const reset = () =>
  useAuthBase.setState(
    {
      url: "",
      username: "",
      password: "",
      isAuthenticated: false,
      token: null,
      userId: null,
      isAdmin: false,
      hasNavidromeNative: false,
      serverVersion: null,
    },
    false,
  );

beforeEach(reset);

describe("auth store", () => {
  it("login sets credentials and authenticated flag, trimming inputs", () => {
    useAuthBase
      .getState()
      .login("  https://music.example.com  ", "  alice  ", "  secret  ");
    const s = useAuthBase.getState();
    expect(s.url).toBe("https://music.example.com");
    expect(s.username).toBe("alice");
    expect(s.password).toBe("secret");
    expect(s.isAuthenticated).toBe(true);
  });

  it("logout clears all credentials", () => {
    useAuthBase.getState().login("https://x", "u", "p");
    useAuthBase.getState().logout();
    expect(useAuthBase.getState()).toMatchObject({
      url: "",
      username: "",
      password: "",
      isAuthenticated: false,
    });
  });

  it("login without navidrome session clears native fields", () => {
    useAuthBase.setState({
      token: "old",
      userId: "u-old",
      isAdmin: true,
      hasNavidromeNative: true,
    });
    useAuthBase.getState().login("https://x", "u", "p");
    const s = useAuthBase.getState();
    expect(s.token).toBeNull();
    expect(s.userId).toBeNull();
    expect(s.isAdmin).toBe(false);
    expect(s.hasNavidromeNative).toBe(false);
  });

  it("login with navidrome session populates native fields", () => {
    useAuthBase.getState().login("https://x", "u", "p", {
      navidrome: { token: "tok-1", userId: "user-1", isAdmin: true },
    });
    const s = useAuthBase.getState();
    expect(s.token).toBe("tok-1");
    expect(s.userId).toBe("user-1");
    expect(s.isAdmin).toBe(true);
    expect(s.hasNavidromeNative).toBe(true);
  });

  it("logout resets navidrome and serverVersion fields", () => {
    useAuthBase.getState().login("https://x", "u", "p", {
      navidrome: { token: "tok-1", userId: "user-1", isAdmin: true },
    });
    useAuthBase.getState().setServerVersion("0.50.0");
    useAuthBase.getState().logout();
    const s = useAuthBase.getState();
    expect(s.token).toBeNull();
    expect(s.userId).toBeNull();
    expect(s.isAdmin).toBe(false);
    expect(s.hasNavidromeNative).toBe(false);
    expect(s.serverVersion).toBeNull();
  });

  it("setNavidromeSession populates fields from session", () => {
    useAuthBase.getState().setNavidromeSession({
      token: "tok-2",
      userId: "user-2",
      isAdmin: false,
    });
    const s = useAuthBase.getState();
    expect(s.token).toBe("tok-2");
    expect(s.userId).toBe("user-2");
    expect(s.isAdmin).toBe(false);
    expect(s.hasNavidromeNative).toBe(true);
  });

  it("setNavidromeSession(null) clears native fields", () => {
    useAuthBase.setState({
      token: "tok",
      userId: "u",
      isAdmin: true,
      hasNavidromeNative: true,
    });
    useAuthBase.getState().setNavidromeSession(null);
    const s = useAuthBase.getState();
    expect(s.token).toBeNull();
    expect(s.userId).toBeNull();
    expect(s.isAdmin).toBe(false);
    expect(s.hasNavidromeNative).toBe(false);
  });

  it("setToken updates the token", () => {
    useAuthBase.getState().setToken("new-token");
    expect(useAuthBase.getState().token).toBe("new-token");
  });

  it("setPassword updates the password", () => {
    useAuthBase.getState().setPassword("new-pass");
    expect(useAuthBase.getState().password).toBe("new-pass");
  });

  it("setServerVersion accepts a string and null", () => {
    useAuthBase.getState().setServerVersion("0.50.0");
    expect(useAuthBase.getState().serverVersion).toBe("0.50.0");
    useAuthBase.getState().setServerVersion(null);
    expect(useAuthBase.getState().serverVersion).toBeNull();
  });
});

describe("auth login schema", () => {
  it("accepts a valid login payload", () => {
    const result = loginSchema.safeParse({
      url: "https://music.example.com",
      username: "alice",
      password: "secret",
      type: "navidrome",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid url", () => {
    const result = loginSchema.safeParse({
      url: "not-a-url",
      username: "alice",
      password: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty fields", () => {
    const result = loginSchema.safeParse({
      url: "https://x.example.com",
      username: "",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});
