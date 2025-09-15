import { Stack } from "expo-router";

export default function LibraryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="favorites" />
      <Stack.Screen name="search" />
      <Stack.Screen name="albums/[id]" />
      <Stack.Screen name="artists/[id]" />
      <Stack.Screen name="playlists/[id]" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="servers" />
      <Stack.Screen name="shares" />
    </Stack>
  );
}
