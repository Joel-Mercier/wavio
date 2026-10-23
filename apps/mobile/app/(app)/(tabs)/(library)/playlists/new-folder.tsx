import { useLocalSearchParams } from "expo-router";
import PlaylistFolderForm from "@/components/playlistFolders/PlaylistFolderForm";

export default function NewPlaylistFolderScreen() {
  const { playlistId } = useLocalSearchParams<{ playlistId?: string }>();
  return <PlaylistFolderForm playlistId={playlistId} />;
}
