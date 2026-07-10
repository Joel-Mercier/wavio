import type { Href } from "expo-router";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { OpenSubsonicErrorResponse } from "@/services/openSubsonic";
import useApp from "@/stores/app";

interface HomeSectionProps {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  seeAllHref?: Href;
  isLoading: boolean;
  error?: OpenSubsonicErrorResponse | Error | null;
  isEmpty: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}

export default function HomeSection({
  title,
  subtitle,
  imageUrl,
  seeAllHref,
  isLoading,
  error,
  isEmpty,
  skeleton,
  children,
}: HomeSectionProps) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const showEmptyHomeSections = useApp((s) => s.showEmptyHomeSections);

  if (!isLoading && !error && isEmpty && !showEmptyHomeSections) {
    return null;
  }

  return (
    <Box>
      <Box className="px-6 mt-4 mb-4">
        <HStack className="items-center justify-between gap-x-4">
          <HStack className="items-center gap-x-3 flex-1">
            {imageUrl && (
              <ImageWithFallback
                source={{ uri: imageUrl }}
                className="w-12 h-12 rounded-full aspect-square"
                alt={t("app.artists.coverAlt")}
                fallback={
                  <Box className="w-12 h-12 rounded-full bg-primary-600 items-center justify-center aspect-square">
                    <User size={24} color={white} />
                  </Box>
                }
              />
            )}
            {subtitle ? (
              <VStack className="flex-1">
                <Text numberOfLines={1} className="text-primary-100" size="sm">
                  {subtitle}
                </Text>
                <Heading
                  numberOfLines={1}
                  className="text-white truncate"
                  size="xl"
                >
                  {title}
                </Heading>
              </VStack>
            ) : (
              <Heading
                numberOfLines={2}
                className="text-white truncate flex-1"
                size="xl"
              >
                {title}
              </Heading>
            )}
          </HStack>
          {seeAllHref && !isLoading && !error && !isEmpty && (
            <FadeOutScaleDown href={seeAllHref}>
              <Text className="text-primary-100">{t("app.shared.seeAll")}</Text>
            </FadeOutScaleDown>
          )}
        </HStack>
      </Box>
      {error ? (
        <ErrorDisplay error={error} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="pl-6 mb-6"
        >
          {isLoading ? skeleton : children}
        </ScrollView>
      )}
      {!isLoading && !error && isEmpty && <EmptyDisplay />}
    </Box>
  );
}
