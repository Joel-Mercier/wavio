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

import {
  currentAuthScope,
  type LoginOptions,
  loginSchema,
  useAuthBase,
} from "@/stores/auth";

const reset = () =>
  useAuthBase.setState(
    {
      serverId: "",
      url: "",
      username: "",
      password: "",
      isAuthenticated: false,
      token: null,
      userId: null,
      isAdmin: false,
      hasNavidromeNative: false,
      serverVersion: null,
      subsonicSalt: null,
      subsonicToken: null,
    },
    false,
  );

const login = (
  url: string,
  username: string,
  password: string,
  options?: LoginOptions,
) =>
  useAuthBase.getState().login({
    serverId: "srv-1",
    url,
    username,
    password,
    ...options,
  });

beforeEach(reset);

describe("auth store", () => {
  it("login sets credentials and authenticated flag, trimming inputs", () => {
    login("  https://music.example.com  ", "  alice  ", "  secret  ");
    const s = useAuthBase.getState();
    expect(s.url).toBe("https://music.example.com");
    expect(s.username).toBe("alice");
    expect(s.password).toBe("secret");
    expect(s.isAuthenticated).toBe(true);
  });

  it("login records the serverId that identifies the storage scope", () => {
    useAuthBase.getState().login({
      serverId: "  srv-42  ",
      url: "https://x",
      username: "u",
      password: "p",
    });
    expect(useAuthBase.getState().serverId).toBe("srv-42");
  });

  it("setActiveUrl repoints the route without touching the serverId", () => {
    login("https://lan.example.com", "alice", "secret");
    useAuthBase.getState().setActiveUrl("  https://wan.example.com  ");
    const s = useAuthBase.getState();
    expect(s.url).toBe("https://wan.example.com");
    // The scope identity and the session must survive a route swap.
    expect(s.serverId).toBe("srv-1");
    expect(s.username).toBe("alice");
    expect(s.password).toBe("secret");
    expect(s.isAuthenticated).toBe(true);
  });

  it("logout clears all credentials", () => {
    login("https://x", "u", "p");
    useAuthBase.getState().logout();
    expect(useAuthBase.getState()).toMatchObject({
      serverId: "",
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
    login("https://x", "u", "p");
    const s = useAuthBase.getState();
    expect(s.token).toBeNull();
    expect(s.userId).toBeNull();
    expect(s.isAdmin).toBe(false);
    expect(s.hasNavidromeNative).toBe(false);
  });

  it("login with navidrome session populates native fields", () => {
    login("https://x", "u", "p", {
      navidrome: { token: "tok-1", userId: "user-1", isAdmin: true },
    });
    const s = useAuthBase.getState();
    expect(s.token).toBe("tok-1");
    expect(s.userId).toBe("user-1");
    expect(s.isAdmin).toBe(true);
    expect(s.hasNavidromeNative).toBe(true);
  });

  it("logout resets navidrome and serverVersion fields", () => {
    login("https://x", "u", "p", {
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

  it("login stores subsonic salt and token, and logout clears them", () => {
    login("https://x", "u", "p", {
      subsonicSalt: "abc123",
      subsonicToken: "deadbeef",
    });
    const s = useAuthBase.getState();
    expect(s.subsonicSalt).toBe("abc123");
    expect(s.subsonicToken).toBe("deadbeef");
    useAuthBase.getState().logout();
    const after = useAuthBase.getState();
    expect(after.subsonicSalt).toBeNull();
    expect(after.subsonicToken).toBeNull();
  });

  it("login without subsonic options clears salt and token", () => {
    useAuthBase.setState({ subsonicSalt: "old", subsonicToken: "old" });
    login("https://x", "u", "p");
    const s = useAuthBase.getState();
    expect(s.subsonicSalt).toBeNull();
    expect(s.subsonicToken).toBeNull();
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

describe("currentAuthScope", () => {
  it("derives the scope from the server id, not the url", () => {
    login("https://lan.example.com", "alice", "secret");
    expect(currentAuthScope()).toBe("srv_1_alice");
  });

  it("is unchanged by a route swap", () => {
    // The whole point of id-based scoping: failing over to a fallback address
    // must not move the bucket, or every scoped store would tear down and
    // rehydrate as if this were a different server.
    login("https://lan.example.com", "alice", "secret");
    const before = currentAuthScope();
    useAuthBase.getState().setActiveUrl("https://wan.example.com");
    expect(currentAuthScope()).toBe(before);
  });

  it("sanitizes non-alphanumerics in the id and username", () => {
    useAuthBase.getState().login({
      serverId: "mg1-2ab",
      url: "https://x",
      username: "a.b@c",
      password: "p",
    });
    expect(currentAuthScope()).toBe("mg1_2ab_a_b_c");
  });

  it("uses the fixed sentinel for the local library", () => {
    useAuthBase.getState().login({
      serverId: "whatever",
      url: "local",
      username: "local",
      password: "",
      serverType: "local",
    });
    expect(currentAuthScope()).toBe("local_local");
  });
});

describe("auth login schema", () => {
  it("accepts a valid login payload", () => {
    const result = loginSchema.safeParse({
      url: "https://music.example.com",
      username: "alice",
      password: "secret",
      type: "navidrome",
      paths: [],
      mtlsAlias: "",
      fallbackUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a local payload without url or credentials", () => {
    const result = loginSchema.safeParse({
      url: "",
      username: "",
      password: "",
      type: "local",
      paths: ["/storage/emulated/0/Music"],
      mtlsAlias: "",
      fallbackUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid fallbackUrl and rejects a malformed one", () => {
    const payload = {
      url: "https://music.example.com",
      username: "alice",
      password: "secret",
      type: "navidrome" as const,
      paths: [],
      mtlsAlias: "",
    };
    expect(
      loginSchema.safeParse({
        ...payload,
        fallbackUrl: "https://wan.example.com",
      }).success,
    ).toBe(true);
    // A cleared UrlInputField leaves the bare protocol behind; that's blank.
    expect(
      loginSchema.safeParse({ ...payload, fallbackUrl: "https://" }).success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({ ...payload, fallbackUrl: "not a url" }).success,
    ).toBe(false);
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
