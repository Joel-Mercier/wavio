import * as z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";

export const serverTypeSchema = z.enum([
  "navidrome",
  "opensubsonic",
  "jellyfin",
  // On-device library: no remote server, just filesystem paths (see `paths`).
  "local",
]);
export type ServerType = z.infer<typeof serverTypeSchema>;

export const serverFormSchema = z.object({
  name: z.string().trim().min(1),
  url: z.url().trim().min(1),
  type: serverTypeSchema,
  // Android KeyChain alias for mTLS client-cert auth; presence enables mTLS.
  mtlsAlias: z.string().trim().optional(),
});

// Add-server form variant: `local` servers have no name/URL (auto-named, fixed
// sentinel URL) and only carry filesystem `paths`, so name/url are validated for
// remote types only. Mirrors `loginSchema` so the form highlights the right
// input for remote servers while letting local through.
export const addServerFormSchema = z
  .object({
    name: z.string().trim(),
    url: z.string().trim(),
    type: serverTypeSchema,
    paths: z.array(z.string()),
    // Required (empty = no cert) so the inferred input type matches the form's
    // string default; presence of a non-empty alias enables mTLS.
    mtlsAlias: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "local") return;
    const name = z.string().min(1).trim().safeParse(data.name);
    if (!name.success) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: name.error.issues[0]?.message,
      });
    }
    const url = z.url().min(1).trim().safeParse(data.url);
    if (!url.success) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: url.error.issues[0]?.message,
      });
    }
  });

// Edit-server form variant: name is always required (editable for every type,
// including the local library), but the URL is validated for remote types only
// since `local` servers carry folders instead.
export const editServerFormSchema = z
  .object({
    name: z.string().trim().min(1),
    url: z.string().trim(),
    type: serverTypeSchema,
    paths: z.array(z.string()),
    mtlsAlias: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "local") return;
    const url = z.url().min(1).trim().safeParse(data.url);
    if (!url.success) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: url.error.issues[0]?.message,
      });
    }
  });

export const serverUserSchema = z.object({
  serverId: z.string().min(1),
  username: z.string().trim().min(1),
  // Opt-in saved password for silent server switching (see utils/switchServer).
  // Stored in plaintext like the active session's password in stores/auth.ts.
  password: z.string().optional(),
});

export type Server = {
  id: string;
  name: string;
  url: string;
  current: boolean;
  type: ServerType;
  // Only set for `type === "local"`: the user-selected filesystem source
  // folders the on-device indexer scans. There is a single local server (no
  // remote URL, no multiple accounts), so this is where its config lives.
  paths?: string[];
  // Android KeyChain alias for mTLS client-cert auth (Android only). Only the
  // alias is stored; the private key stays in the OS keystore. Its presence is
  // what enables mTLS for this server. See modules/ssl-trust.
  mtlsAlias?: string;
};

export type ServerUser = {
  serverId: string;
  username: string;
  // Opt-in saved password enabling silent re-auth on server switch. Absent when
  // the user chose not to save credentials.
  password?: string;
};

interface ServersStore {
  servers: Server[];
  users: ServerUser[];
  addServer: (input: {
    name: string;
    url: string;
    type?: ServerType;
    paths?: string[];
    mtlsAlias?: string;
  }) => Server;
  editServer: (
    id: string,
    patch: {
      name?: string;
      url?: string;
      type?: ServerType;
      paths?: string[];
      mtlsAlias?: string;
    },
  ) => void;
  removeServer: (id: string) => void;
  setCurrentServer: (id: string) => void;
  getCurrentServer: () => Server | undefined;
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
      addServer: ({ name, url, type, paths, mtlsAlias }) => {
        const trimmedUrl = url.trim();
        const trimmedName = name.trim();
        const cleanAlias = mtlsAlias?.trim() || undefined;
        const existing = get().servers.find((s) => s.url === trimmedUrl);
        if (existing) {
          const patch: Partial<Server> = {};
          if (type && existing.type !== type) patch.type = type;
          if (paths) patch.paths = paths;
          if (mtlsAlias !== undefined && existing.mtlsAlias !== cleanAlias) {
            patch.mtlsAlias = cleanAlias;
          }
          if (Object.keys(patch).length > 0) {
            set((state) => ({
              servers: state.servers.map((s) =>
                s.id === existing.id ? { ...s, ...patch } : s,
              ),
            }));
            return { ...existing, ...patch };
          }
          return existing;
        }
        const hasCurrent = get().servers.some((s) => s.current);
        const created: Server = {
          id: generateId(),
          name: trimmedName,
          url: trimmedUrl,
          current: !hasCurrent,
          type: type ?? "navidrome",
          ...(paths ? { paths } : {}),
          ...(cleanAlias ? { mtlsAlias: cleanAlias } : {}),
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
                  ...(patch.type !== undefined ? { type: patch.type } : {}),
                  ...(patch.paths !== undefined ? { paths: patch.paths } : {}),
                  ...(patch.mtlsAlias !== undefined
                    ? { mtlsAlias: patch.mtlsAlias.trim() || undefined }
                    : {}),
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
      getCurrentServer: () => get().servers.find((s) => s.current),
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
          ...(user.password !== undefined ? { password: user.password } : {}),
        };
        set((state) => {
          const exists = state.users.some(
            (u) =>
              u.serverId === trimmed.serverId &&
              u.username === trimmed.username,
          );
          if (!exists) return { users: [...state.users, trimmed] };
          // Existing user: overwrite the saved password with the passed value,
          // including clearing it when `password` is omitted (unchecked box).
          return {
            users: state.users.map((u) =>
              u.serverId === trimmed.serverId && u.username === trimmed.username
                ? { ...u, password: user.password }
                : u,
            ),
          };
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
        set((state) => {
          // Preserve any saved password for usernames that survive the sync so
          // refreshing the server's user list doesn't wipe stored credentials.
          const existingByName = new Map(
            state.users
              .filter((u) => u.serverId === serverId)
              .map((u) => [u.username, u]),
          );
          return {
            users: [
              ...state.users.filter((u) => u.serverId !== serverId),
              ...unique.map((username) => {
                const saved = existingByName.get(username)?.password;
                return {
                  serverId,
                  username,
                  ...(saved !== undefined ? { password: saved } : {}),
                };
              }),
            ],
          };
        });
      },
    }),
    {
      name: "servers",
      storage: createJSONStorage(() => zustandStorage),
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<ServersStore> | undefined;
        if (!state || version >= 2) return persistedState as ServersStore;
        return {
          ...state,
          servers: (state.servers ?? []).map((s) => ({
            ...s,
            type: (s as Server).type ?? "navidrome",
          })),
        } as ServersStore;
      },
    },
  ),
);

export { useServersBase };

const useServers = createSelectors(useServersBase);

export default useServers;
