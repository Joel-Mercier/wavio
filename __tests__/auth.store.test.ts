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
    { url: "", username: "", password: "", isAuthenticated: false },
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
});

describe("auth login schema", () => {
  it("accepts a valid login payload", () => {
    const result = loginSchema.safeParse({
      url: "https://music.example.com",
      username: "alice",
      password: "secret",
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
