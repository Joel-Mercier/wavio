import type { useRouter } from "expo-router";

type AppRouter = ReturnType<typeof useRouter>;

export function goBackOrHome(router: AppRouter) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.navigate("/(app)/(tabs)/(home)");
  }
}
