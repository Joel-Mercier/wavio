import { useQuery } from "@tanstack/react-query";
import { generateArtistMix } from "@/services/mixes/artistMix";
import { generateGenreMix } from "@/services/mixes/genreMix";
import { useCurrentMusicFolderIds } from "@/stores/musicFolders";
import { mulberry32 } from "@/utils/shuffle";

export type MixKind = "artist" | "genre";

export function useMix({
  kind,
  id,
  name,
  musicBrainzId,
  seed,
}: {
  kind: MixKind;
  id: string;
  name: string;
  musicBrainzId?: string;
  /** Bumped to regenerate; each value is its own, stable mix. */
  seed: number;
}) {
  const musicFolderIds = useCurrentMusicFolderIds();
  return useQuery({
    queryKey: ["mix", kind, id, musicFolderIds, seed],
    queryFn: ({ signal }) => {
      const rand = mulberry32(seed);
      return kind === "artist"
        ? generateArtistMix(
            { id, name, musicBrainzId },
            { musicFolderIds, rand, signal },
          )
        : generateGenreMix(id, { musicFolderIds, rand });
    },
    enabled: !!id,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
