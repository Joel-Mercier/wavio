import { useTranslation } from "react-i18next";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { UnmatchedAlbum } from "@/services/musicbrainz/scanner";

export default function MusicBrainzUnmatchedItem({
  album,
}: {
  album: UnmatchedAlbum;
}) {
  const { t } = useTranslation();

  return (
    <VStack className="gap-y-1 py-3">
      <Heading className="text-white font-normal" size="sm" numberOfLines={1}>
        {album.name ?? album.albumKey}
      </Heading>
      <Text className="text-primary-100 text-xs" numberOfLines={2}>
        {[
          album.artist,
          t(
            `app.settings.integrations.musicbrainz.unmatched.reasons.${album.reason}`,
          ),
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </VStack>
  );
}
