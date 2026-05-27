import HomeSection from "@/components/home/sections/HomeSection";
import SongCard from "@/components/home/sections/SongCard";
import SongCardSkeleton from "@/components/home/sections/SongCardSkeleton";
import { useRandomSongs, useSongsByGenre } from "@/hooks/backend/useLists";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";

interface BaseProps {
  title: string;
  enabled: boolean;
}

export function RandomSongsSection({ title, enabled }: BaseProps) {
  const musicFolderId = useCurrentMusicFolderId();
  const { data, isLoading, error } = useRandomSongs(
    { size: 12, musicFolderId },
    { enabled },
  );
  const songs = data?.songs?.song;
  return (
    <HomeSection
      title={title}
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!songs?.length}
      skeleton={loadingData(4).map((_, index) => (
        <SongCardSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`random-song-skeleton-${index}`}
        />
      ))}
    >
      {songs?.map((song, index) => (
        <SongCard key={song.id} track={song} trackList={songs} index={index} />
      ))}
    </HomeSection>
  );
}

interface SongsByGenreProps extends BaseProps {
  genre: string;
}

export function SongsByGenreSection({
  title,
  enabled,
  genre,
}: SongsByGenreProps) {
  const musicFolderId = useCurrentMusicFolderId();
  const { data, isLoading, error } = useSongsByGenre(
    { genre, count: 12, musicFolderId },
    { enabled },
  );
  const songs = data?.songs?.song;
  return (
    <HomeSection
      title={title}
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!songs?.length}
      skeleton={loadingData(4).map((_, index) => (
        <SongCardSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`genre-song-skeleton-${index}`}
        />
      ))}
    >
      {songs?.map((song, index) => (
        <SongCard key={song.id} track={song} trackList={songs} index={index} />
      ))}
    </HomeSection>
  );
}
