import { Redirect, Stack } from "expo-router";
import useAuth from "@/stores/auth";

export default function AuthLayout() {
  const isAuthenticated = useAuth((store) => store.isAuthenticated);
  if (isAuthenticated) {
    console.log(
      "[app] User is authenticated, redirecting to (app)/(tabs)/(home)",
    );
    return <Redirect href="/(app)/(tabs)/(home)" />;
  }
  console.log("[app] User is not authenticated, rendering (auth)/login");
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
