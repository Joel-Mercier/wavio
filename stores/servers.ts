import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const serverSchema = z.object({
  name: z.string().min(1),
  url: z.url().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  current: z.boolean().optional(),
});

export type Server = {
  name: string;
  username: string;
  password: string;
  url: string;
  current: boolean;
};

interface ServersStore {
  servers: Server[];
  addServer: (server: Server) => void;
  editServer: (server: Server) => void;
  removeServer: (name: string) => void;
  setCurrentServer: (name: string) => void;
}

const useServersBase = create<ServersStore>()(
  persist(
    (set) => ({
      servers: [],
      addServer: (server: Server) => {
        set((state) => {
          const isDuplicate = state.servers.some(
            (existingServer) =>
              existingServer.name === server.name ||
              existingServer.url === server.url,
          );

          if (isDuplicate) {
            return { servers: state.servers };
          }

          const hasCurrentServer = state.servers.some(
            (existingServer) => existingServer.current === true,
          );

          const serverToAdd = hasCurrentServer
            ? server
            : { ...server, current: true };

          const newServers = [serverToAdd, ...state.servers];
          if (newServers.length > 24) {
            newServers.length = 24;
          }
          return { servers: newServers };
        });
      },
      editServer: (server: Server) => {
        set((state) => {
          const newServers = state.servers.map((s) => {
            if (s.name === server.name) {
              return server;
            }
            return s;
          });
          return { servers: newServers };
        });
      },
      removeServer: (name: string) => {
        set((state) => {
          return {
            servers: state.servers.filter((server) => server.name !== name),
          };
        });
      },
      setCurrentServer: (name: string) => {
        set((state) => {
          return {
            servers: state.servers.map((server) => {
              if (server.name === name) {
                return { ...server, current: true };
              }
              return { ...server, current: false };
            }),
          };
        });
      },
    }),
    {
      name: "servers",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const useServers = createSelectors(useServersBase);

export default useServers;
