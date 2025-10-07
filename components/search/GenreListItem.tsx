import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Genre } from "@/services/openSubsonic/types";
import { useTranslation } from "react-i18next";

interface GenreListItemProps {
  genre: Genre;
}

export default function GenreListItem({ genre }: GenreListItemProps) {
  const { t } = useTranslation();
  return (
    <FadeOutScaleDown href={`/(tabs)/(search)/genres/${genre.value}`}>
      <VStack className="bg-primary-600 p-4 w-full rounded-md">
        <Heading size="md" className="text-white mb-8">
          {genre.value}
        </Heading>
        <HStack>
          <Text className="text-primary-100 text-sm">
            {t("app.shared.songCount", { count: genre.songCount })}
          </Text>
          <Text className="text-primary-100 text-sm"> ⦁ </Text>
          <Text className="text-primary-100 text-sm">
            {t("app.shared.albumCount", { count: genre.albumCount })}
          </Text>
        </HStack>
      </VStack>
    </FadeOutScaleDown>
  );
}
