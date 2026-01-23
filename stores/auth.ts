import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";
import * as z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const loginSchema = z.object({
  url: z.url().min(1).trim(),
  username: z.string().min(1).trim(),
  password: z.string().min(1).trim(),
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
        set({
          url: url.trim(),
          username: username.trim(),
          password: password.trim(),
          isAuthenticated: true,
        });
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
