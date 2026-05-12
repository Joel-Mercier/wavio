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
  syncServerUsers: (serverId: string, usernames: string[]) => void;
}

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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
        };
        set((state) => {
          const exists = state.users.some(
            (u) =>
              u.serverId === trimmed.serverId &&
              u.username === trimmed.username,
          );
          if (exists) return state;
          return { users: [...state.users, trimmed] };
        });
      },
      removeUser: (serverId, username) => {
        set((state) => ({
          users: state.users.filter(
            (u) => !(u.serverId === serverId && u.username === username),
          ),
        }));
      },
      syncServerUsers: (serverId, usernames) => {
        const unique = Array.from(
          new Set(usernames.map((u) => u.trim()).filter(Boolean)),
        );
        set((state) => ({
          users: [
            ...state.users.filter((u) => u.serverId !== serverId),
            ...unique.map((username) => ({ serverId, username })),
          ],
        }));
      },
    }),
    {
      name: "servers",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

export { useServersBase };

const useServers = createSelectors(useServersBase);

export default useServers;
