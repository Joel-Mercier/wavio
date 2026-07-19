import { Stack } from "expo-router";

export default function LibraryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="favorites" />
      <Stack.Screen name="favorites/search" />
      <Stack.Screen name="search" />
      <Stack.Screen name="albums/index" />
      <Stack.Screen name="albums/[id]" />
      <Stack.Screen name="artists/index" />
      <Stack.Screen name="artists/[id]" />
      <Stack.Screen name="artists/[id]/biography" />
      <Stack.Screen name="artists/[id]/discography" />
      <Stack.Screen name="artists/[id]/liked-songs" />
      <Stack.Screen name="playlists/add-to-playlist" />
      <Stack.Screen name="playlists/[id]/index" />
      <Stack.Screen name="playlists/[id]/search" />
      <Stack.Screen name="playlists/[id]/edit" />
      <Stack.Screen name="playlists/[id]/reorder" />
      <Stack.Screen name="tracks/[id]/similar" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/[section]" />
      <Stack.Screen name="downloaders/lidarr" />
      <Stack.Screen name="downloaders/discovery" />
      <Stack.Screen name="downloaders/downloads" />
      <Stack.Screen name="downloaders/artist/[id]" />
      <Stack.Screen name="downloaders/album/[id]" />
      <Stack.Screen name="trusted-certificates" />
      <Stack.Screen name="offline-downloads" />
      <Stack.Screen name="pending-changes" />
      <Stack.Screen name="servers" />
      <Stack.Screen name="shares" />
      <Stack.Screen name="libraries" />
      <Stack.Screen name="folders/[id]" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="queue" />
      <Stack.Screen name="podcast-series/[id]" />
      <Stack.Screen name="podcast-channels/[id]" />
    </Stack>
  );
}
