import { Stack } from "expo-router";

export default function LibraryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="favorites" />
      <Stack.Screen name="search" />
      <Stack.Screen name="albums/[id]" />
      <Stack.Screen name="artists/[id]" />
      <Stack.Screen name="artists/[id]/biography" />
      <Stack.Screen name="artists/[id]/discography" />
      <Stack.Screen name="playlists/add-to-playlist" />
      <Stack.Screen name="playlists/[id]" />
      <Stack.Screen name="playlists/[id]/edit" />
      <Stack.Screen name="playlists/[id]/reorder" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="servers" />
      <Stack.Screen name="shares" />
    </Stack>
  );
}
