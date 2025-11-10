import { Stack } from "expo-router";

export default function SearchLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="recent-searches" />
      <Stack.Screen name="search-results" />
      <Stack.Screen name="albums/[id]" />
      <Stack.Screen name="artists/[id]" />
      <Stack.Screen name="artists/[id]/biography" />
      <Stack.Screen name="artists/[id]/discography" />
      <Stack.Screen name="playlists/[id]" />
      <Stack.Screen name="playlists/[id]/search" />
      <Stack.Screen name="playlists/add-to-playlist" />
      <Stack.Screen name="genres/[id]" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="servers" />
      <Stack.Screen name="shares" />
    </Stack>
  );
}
