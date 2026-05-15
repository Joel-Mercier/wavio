import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Genre } from "@/services/openSubsonic/types";
import useAuth from "@/stores/auth";

interface GenreListItemProps {
  genre: Genre;
}

export default function GenreListItem({ genre }: GenreListItemProps) {
  const { t } = useTranslation();
  const serverType = useAuth((s) => s.serverType);
  const showCounts = serverType !== "jellyfin";
  return (
    <FadeOutScaleDown href={`/genres/${genre.value}`}>
      <VStack className="bg-primary-600 p-4 w-full rounded-md">
        <Heading
          size="md"
          className={showCounts ? "text-white mb-8" : "text-white"}
        >
          {genre.value}
        </Heading>
        {showCounts && (
          <HStack>
            <Text className="text-primary-100 text-sm">
              {t("app.shared.songCount", { count: genre.songCount })}
            </Text>
            <Text className="text-primary-100 text-sm"> ⦁ </Text>
            <Text className="text-primary-100 text-sm">
              {t("app.shared.albumCount", { count: genre.albumCount })}
            </Text>
          </HStack>
        )}
      </VStack>
    </FadeOutScaleDown>
  );
}
