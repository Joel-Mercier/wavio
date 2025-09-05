import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const loginSchema = z.object({
  url: z.url().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

type AuthStore = {
  url: string;
  username: string;
  password: string;
  isAuthenticated: boolean;
  login: (url: string, username: string, password: string) => void;
  logout: () => void;
};

export const useAuthBase = create<AuthStore>()(
  persist(
    (set) => ({
      url: "",
      username: "",
      password: "",
      isAuthenticated: false,
      login: (url: string, username: string, password: string) => {
        set({ url, username, password, isAuthenticated: true });
      },
      logout: () => {
        set({ url: "", username: "", password: "", isAuthenticated: false });
      },
    }),
    {
      name: "auth",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const useAuth = createSelectors(useAuthBase);

export default useAuth;
