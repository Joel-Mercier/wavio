import { useServersBase } from "@/stores/servers";

jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (key: string, value: string) => {
        mem.set(key, value);
      },
      getString: (key: string) => {
        return mem.get(key) ?? null;
      },
      remove: (key: string) => {
        mem.delete(key);
      },
    },
    zustandStorage: {
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
      getItem: (key: string) => mem.get(key) ?? null,
      removeItem: (key: string) => {
        mem.delete(key);
      },
    },
  };
});

const reset = () => useServersBase.setState({ servers: [], users: [] }, false);

describe("servers store actions", () => {
  beforeEach(reset);

  it("addServer dedups by URL and returns existing", () => {
    const a = useServersBase.getState().addServer({
      name: "A",
      url: "https://x.example.com",
    });
    const b = useServersBase.getState().addServer({
      name: "B",
      url: "https://x.example.com",
    });
    expect(b.id).toBe(a.id);
    expect(useServersBase.getState().servers).toHaveLength(1);
  });

  it("first added server becomes current", () => {
    const a = useServersBase
      .getState()
      .addServer({ name: "A", url: "https://a.example.com" });
    expect(a.current).toBe(true);
    const b = useServersBase
      .getState()
      .addServer({ name: "B", url: "https://b.example.com" });
    expect(b.current).toBe(false);
  });

  it("setCurrentServer is exclusive", () => {
    const a = useServersBase
      .getState()
      .addServer({ name: "A", url: "https://a.example.com" });
    const b = useServersBase
      .getState()
      .addServer({ name: "B", url: "https://b.example.com" });
    useServersBase.getState().setCurrentServer(b.id);
    const servers = useServersBase.getState().servers;
    expect(servers.find((s) => s.id === a.id)?.current).toBe(false);
    expect(servers.find((s) => s.id === b.id)?.current).toBe(true);
  });

  it("addOrUpdateUser is idempotent on (serverId, username)", () => {
    const s = useServersBase
      .getState()
      .addServer({ name: "A", url: "https://a.example.com" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: s.id, username: "u" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: s.id, username: "u" });
    const users = useServersBase.getState().getUsersForServer(s.id);
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe("u");
  });

  it("removeServer cascades to users", () => {
    const s = useServersBase
      .getState()
      .addServer({ name: "A", url: "https://a.example.com" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: s.id, username: "u" });
    useServersBase.getState().removeServer(s.id);
    expect(useServersBase.getState().servers).toHaveLength(0);
    expect(useServersBase.getState().users).toHaveLength(0);
  });

  it("removeUser only removes matching pair", () => {
    const s = useServersBase
      .getState()
      .addServer({ name: "A", url: "https://a.example.com" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: s.id, username: "u1" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: s.id, username: "u2" });
    useServersBase.getState().removeUser(s.id, "u1");
    const users = useServersBase.getState().getUsersForServer(s.id);
    expect(users.map((u) => u.username)).toEqual(["u2"]);
  });

  it("syncServerUsers replaces users for a server only", () => {
    const a = useServersBase
      .getState()
      .addServer({ name: "A", url: "https://a.example.com" });
    const b = useServersBase
      .getState()
      .addServer({ name: "B", url: "https://b.example.com" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: a.id, username: "old" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: b.id, username: "keep" });
    useServersBase.getState().syncServerUsers(a.id, ["x", "y", "y", " z "]);
    const aUsers = useServersBase
      .getState()
      .getUsersForServer(a.id)
      .map((u) => u.username);
    const bUsers = useServersBase
      .getState()
      .getUsersForServer(b.id)
      .map((u) => u.username);
    expect(aUsers).toEqual(["x", "y", "z"]);
    expect(bUsers).toEqual(["keep"]);
  });

  it("editServer preserves id and current", () => {
    const s = useServersBase
      .getState()
      .addServer({ name: "A", url: "https://a.example.com" });
    useServersBase.getState().editServer(s.id, { name: "A2" });
    const updated = useServersBase.getState().getServerById(s.id);
    expect(updated?.name).toBe("A2");
    expect(updated?.url).toBe("https://a.example.com");
    expect(updated?.current).toBe(true);
  });
});
