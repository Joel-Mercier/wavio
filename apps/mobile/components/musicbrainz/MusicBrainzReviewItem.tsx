import { useRouter } from "expo-router";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { localAlbumId } from "@/services/local/keys";
import type { PendingReview } from "@/services/musicbrainz/scanner";

export default function MusicBrainzReviewItem({
  match,
}: {
  match: PendingReview;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];

  return (
    <FadeOutScaleDown
      onPress={() => {
        // Hex-encoded album id, not the raw key: keys contain spaces and can
        // contain "/", and expo-router runs every param through
        // decodeURIComponent. See services/local/keys.ts.
        router.push(
          `/integrations/musicbrainz-album/${localAlbumId(match.albumKey)}`,
        );
      }}
    >
      <HStack className="items-center gap-x-4 py-4">
        <VStack className="gap-y-1 flex-1">
          <Heading
            className="text-white font-normal"
            size="md"
            numberOfLines={1}
          >
            {match.name ?? match.albumKey}
          </Heading>
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {[
              match.artist,
              t("app.settings.integrations.musicbrainz.review.confidence", {
                confidence: Math.round(match.confidence * 100),
              }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </VStack>
        <Box className="w-5 items-center">
          <ChevronRight size={20} color={gray200} />
        </Box>
      </HStack>
    </FadeOutScaleDown>
  );
}
