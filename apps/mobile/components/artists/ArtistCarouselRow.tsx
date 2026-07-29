import { ScrollView } from "react-native";
import ArtistListItem from "@/components/artists/ArtistListItem";
import NotInLibraryArtistListItem from "@/components/artists/NotInLibraryArtistListItem";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { ArtistID3 } from "@/services/openSubsonic/types";
import { artistListKey, isArtistInLibrary } from "@/utils/artistPresence";

interface ArtistCarouselRowProps {
  title: string;
  /** Where the recommendations came from — see ArtistDetail. */
  subtitle?: string;
  artists: ArtistID3[];
}

// A horizontal strip of artists, shaped like the "Appears on" album strip it
// sits next to. Optional enrichment, so an empty list renders nothing at all
// rather than a skeleton or an empty state.
//
// Padding sits on the header and on the scroll *content* rather than on this
// wrapper, matching HomeSection: an inset ScrollView would clip its items at
// both edges mid-scroll. The trailing gap comes from the last item's own mr-6.
export default function ArtistCarouselRow({
  title,
  subtitle,
  artists,
}: ArtistCarouselRowProps) {
  if (!artists.length) return null;

  return (
    <VStack className="bg-black pb-6">
      <VStack className="mb-4 px-6">
        <Heading className="text-white">{title}</Heading>
        {!!subtitle && (
          <Text className="text-primary-100" size="sm">
            {subtitle}
          </Text>
        )}
      </VStack>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="pl-6"
      >
        {/* A recommendation list can name artists the library doesn't hold —
            they share one sentinel id, so they're keyed by name and rendered as
            a tile that leads to Lidarr instead of a detail screen. */}
        {artists.map((artist, index) =>
          isArtistInLibrary(artist) ? (
            <ArtistListItem
              key={artistListKey(artist)}
              artist={artist}
              index={index}
              layout="horizontal"
            />
          ) : (
            <NotInLibraryArtistListItem
              key={artistListKey(artist)}
              artist={artist}
            />
          ),
        )}
      </ScrollView>
    </VStack>
  );
}
