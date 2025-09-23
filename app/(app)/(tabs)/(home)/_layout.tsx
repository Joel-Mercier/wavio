import { Stack } from "expo-router";

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="albums/[id]" />
      <Stack.Screen name="artists/[id]" />
      <Stack.Screen name="artists/[id]/biography" />
      <Stack.Screen name="playlists/[id]" />
      <Stack.Screen name="internet-radio-stations/[id]" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="servers" />
      <Stack.Screen name="shares" />
    </Stack>
  );
}
