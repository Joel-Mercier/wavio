import { Stack } from "expo-router";

export default function SearchLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="recent-searches" />
      <Stack.Screen name="search-results" />
      <Stack.Screen name="albums/[id]" />
      <Stack.Screen name="artists/[id]" />
      <Stack.Screen name="playlists/[id]" />
      <Stack.Screen name="genres/[id]" />
    </Stack>
  );
}
