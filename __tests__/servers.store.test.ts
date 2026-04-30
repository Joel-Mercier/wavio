import { migrateServersState, useServersBase } from "@/stores/servers";

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

describe("servers store migration", () => {
  it("splits embedded credentials into servers + users, deduping by URL", () => {
    const legacy = {
      servers: [
        {
          name: "Home",
          url: "https://music.example.com",
          username: "alice",
          password: "pw1",
          current: true,
        },
        {
          name: "Home alt",
          url: "https://music.example.com",
          username: "bob",
          password: "pw2",
        },
        {
          name: "Other",
          url: "https://other.example.com",
          username: "alice",
          password: "pw3",
        },
      ],
    };
    const migrated = migrateServersState(legacy);
    expect(migrated.servers).toHaveLength(2);
    expect(migrated.servers[0]).toMatchObject({
      name: "Home",
      url: "https://music.example.com",
      current: true,
    });
    expect(migrated.servers[1]).toMatchObject({
      name: "Other",
      current: false,
    });
    expect(migrated.users).toHaveLength(3);
    const homeId = migrated.servers[0].id;
    const otherId = migrated.servers[1].id;
    expect(
      migrated.users
        .filter((u) => u.serverId === homeId)
        .map((u) => u.username),
    ).toEqual(["alice", "bob"]);
    expect(
      migrated.users
        .filter((u) => u.serverId === otherId)
        .map((u) => u.username),
    ).toEqual(["alice"]);
  });

  it("returns empty arrays when persisted is undefined", () => {
    const migrated = migrateServersState(undefined);
    expect(migrated).toEqual({ servers: [], users: [] });
  });
});

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

  it("addOrUpdateUser upserts on (serverId, username)", () => {
    const s = useServersBase
      .getState()
      .addServer({ name: "A", url: "https://a.example.com" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: s.id, username: "u", password: "p1" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: s.id, username: "u", password: "p2" });
    const users = useServersBase.getState().getUsersForServer(s.id);
    expect(users).toHaveLength(1);
    expect(users[0].password).toBe("p2");
  });

  it("removeServer cascades to users", () => {
    const s = useServersBase
      .getState()
      .addServer({ name: "A", url: "https://a.example.com" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: s.id, username: "u", password: "p" });
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
      .addOrUpdateUser({ serverId: s.id, username: "u1", password: "p" });
    useServersBase
      .getState()
      .addOrUpdateUser({ serverId: s.id, username: "u2", password: "p" });
    useServersBase.getState().removeUser(s.id, "u1");
    const users = useServersBase.getState().getUsersForServer(s.id);
    expect(users.map((u) => u.username)).toEqual(["u2"]);
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
