import useAuth from "@/stores/auth";
import { Redirect, Stack } from "expo-router";

export default function AuthLayout() {
  const isAuthenticated = useAuth.use.isAuthenticated();
  if (isAuthenticated) {
    return <Redirect href="/(app)/(tabs)/(home)" />;
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
