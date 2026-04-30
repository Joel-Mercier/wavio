import * as z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";

export const serverFormSchema = z.object({
  name: z.string().trim().min(1),
  url: z.url().trim().min(1),
});

export const serverUserSchema = z.object({
  serverId: z.string().min(1),
  username: z.string().trim().min(1),
  password: z.string().trim().min(1),
});

export type Server = {
  id: string;
  name: string;
  url: string;
  current: boolean;
};

export type ServerUser = {
  serverId: string;
  username: string;
  password: string;
};

interface ServersStore {
  servers: Server[];
  users: ServerUser[];
  addServer: (input: { name: string; url: string }) => Server;
  editServer: (id: string, patch: { name?: string; url?: string }) => void;
  removeServer: (id: string) => void;
  setCurrentServer: (id: string) => void;
  getServerById: (id: string) => Server | undefined;
  getServerByUrl: (url: string) => Server | undefined;
  getUsersForServer: (id: string) => ServerUser[];
  addOrUpdateUser: (user: ServerUser) => void;
  removeUser: (serverId: string, username: string) => void;
}

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

type LegacyServer = {
  name: string;
  url: string;
  username: string;
  password: string;
  current?: boolean;
};

export const migrateServersState = (
  persisted: { servers?: LegacyServer[] } | undefined,
): { servers: Server[]; users: ServerUser[] } => {
  const servers: Server[] = [];
  const users: ServerUser[] = [];
  const oldServers = persisted?.servers ?? [];
  for (const s of oldServers) {
    const trimmedUrl = (s.url ?? "").trim();
    let target = servers.find((x) => x.url === trimmedUrl);
    if (!target) {
      target = {
        id: generateId(),
        name: s.name,
        url: trimmedUrl,
        current: !!s.current,
      };
      servers.push(target);
    } else if (s.current) {
      target.current = true;
    }
    if (
      s.username &&
      !users.some((u) => u.serverId === target!.id && u.username === s.username)
    ) {
      users.push({
        serverId: target.id,
        username: s.username,
        password: s.password,
      });
    }
  }
  return { servers, users };
};

const useServersBase = create<ServersStore>()(
  persist(
    (set, get) => ({
      servers: [],
      users: [],
      addServer: ({ name, url }) => {
        const trimmedUrl = url.trim();
        const trimmedName = name.trim();
        const existing = get().servers.find((s) => s.url === trimmedUrl);
        if (existing) {
          return existing;
        }
        const hasCurrent = get().servers.some((s) => s.current);
        const created: Server = {
          id: generateId(),
          name: trimmedName,
          url: trimmedUrl,
          current: !hasCurrent,
        };
        set((state) => {
          const next = [created, ...state.servers];
          if (next.length > 24) {
            next.length = 24;
          }
          return { servers: next };
        });
        return created;
      },
      editServer: (id, patch) => {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...(patch.name !== undefined
                    ? { name: patch.name.trim() }
                    : {}),
                  ...(patch.url !== undefined ? { url: patch.url.trim() } : {}),
                }
              : s,
          ),
        }));
      },
      removeServer: (id) => {
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
          users: state.users.filter((u) => u.serverId !== id),
        }));
      },
      setCurrentServer: (id) => {
        set((state) => ({
          servers: state.servers.map((s) => ({
            ...s,
            current: s.id === id,
          })),
        }));
      },
      getServerById: (id) => get().servers.find((s) => s.id === id),
      getServerByUrl: (url) => {
        const trimmed = url.trim();
        return get().servers.find((s) => s.url === trimmed);
      },
      getUsersForServer: (id) => get().users.filter((u) => u.serverId === id),
      addOrUpdateUser: (user) => {
        const trimmed: ServerUser = {
          serverId: user.serverId,
          username: user.username.trim(),
          password: user.password.trim(),
        };
        set((state) => {
          const idx = state.users.findIndex(
            (u) =>
              u.serverId === trimmed.serverId &&
              u.username === trimmed.username,
          );
          if (idx === -1) {
            return { users: [...state.users, trimmed] };
          }
          const next = state.users.slice();
          next[idx] = trimmed;
          return { users: next };
        });
      },
      removeUser: (serverId, username) => {
        set((state) => ({
          users: state.users.filter(
            (u) => !(u.serverId === serverId && u.username === username),
          ),
        }));
      },
    }),
    {
      name: "servers",
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persisted, version) => {
        if (!persisted || version >= 1) {
          return persisted as ServersStore;
        }
        const migrated = migrateServersState(
          persisted as { servers?: LegacyServer[] },
        );
        return { ...(persisted as object), ...migrated } as ServersStore;
      },
    },
  ),
);

export { useServersBase };

const useServers = createSelectors(useServersBase);

export default useServers;
