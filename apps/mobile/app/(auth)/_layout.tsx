import { type Href, Redirect, Stack } from "expo-router";
import useAuth from "@/stores/auth";
import { consumePendingHref } from "@/utils/navigation";

export default function AuthLayout() {
  const isAuthenticated = useAuth((store) => store.isAuthenticated);
  if (isAuthenticated) {
    // A deep link that arrived while signed out (launcher shortcut, widget tap)
    // resumes here instead of being dropped for Home. Consumed in this branch
    // rather than in a hook at the top: the unauthenticated first render would
    // otherwise swallow the href before the user has signed in.
    const pendingHref = consumePendingHref();
    if (__DEV__)
      console.log(
        `[app] User is authenticated, redirecting to ${pendingHref ?? "(app)/(tabs)/(home)"}`,
      );
    return <Redirect href={(pendingHref ?? "/(app)/(tabs)/(home)") as Href} />;
  }
  if (__DEV__)
    console.log("[app] User is not authenticated, rendering (auth)/login");
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="switching" />
    </Stack>
  );
}
