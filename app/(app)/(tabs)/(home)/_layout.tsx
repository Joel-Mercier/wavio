import { Stack } from "expo-router";

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="albums/[id]" />
      <Stack.Screen name="artists/[id]" />
      <Stack.Screen name="playlists/[id]" />
    </Stack>
  );
}
