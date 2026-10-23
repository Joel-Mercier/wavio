import { useLocalSearchParams } from "expo-router";
import PlaylistFolderForm from "@/components/playlistFolders/PlaylistFolderForm";

export default function EditPlaylistFolderScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <PlaylistFolderForm editKey={key} />;
}
