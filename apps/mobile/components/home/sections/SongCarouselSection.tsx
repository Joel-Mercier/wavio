import { memo } from "react";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import SongCard from "@/components/home/sections/SongCard";
import { SONG_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import {
  useMostPlayedSongs,
  useRandomSongs,
  useSongsByGenre,
} from "@/hooks/backend/useLists";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";

interface BaseProps {
  title: string;
  sectionIndex: number;
}

function RandomSongs({ title, sectionIndex }: BaseProps) {
  const enabled = useSectionEnabled(sectionIndex);
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
      skeleton={SONG_CAROUSEL_SKELETON}
    >
      {songs?.map((song, index) => (
        <SongCard key={song.id} track={song} trackList={songs} index={index} />
      ))}
    </HomeSection>
  );
}

function MostPlayedTracks({ title, sectionIndex }: BaseProps) {
  const enabled = useSectionEnabled(sectionIndex);
  const musicFolderId = useCurrentMusicFolderId();
  const { data, isLoading, error } = useMostPlayedSongs(
    { size: 12, musicFolderId },
    { enabled },
  );
  const songs = data?.songs?.song;
  return (
    <HomeSection
      title={title}
      seeAllHref="/(app)/(tabs)/(home)/most-played-tracks"
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!songs?.length}
      skeleton={SONG_CAROUSEL_SKELETON}
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

function SongsByGenre({ title, sectionIndex, genre }: SongsByGenreProps) {
  const enabled = useSectionEnabled(sectionIndex);
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
      skeleton={SONG_CAROUSEL_SKELETON}
    >
      {songs?.map((song, index) => (
        <SongCard key={song.id} track={song} trackList={songs} index={index} />
      ))}
    </HomeSection>
  );
}

export const RandomSongsSection = memo(RandomSongs);
export const MostPlayedTracksSection = memo(MostPlayedTracks);
export const SongsByGenreSection = memo(SongsByGenre);
