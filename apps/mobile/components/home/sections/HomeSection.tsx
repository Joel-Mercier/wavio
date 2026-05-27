import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import type { OpenSubsonicErrorResponse } from "@/services/openSubsonic";

interface HomeSectionProps {
  title: string;
  seeAllHref?: Href;
  isLoading: boolean;
  error?: OpenSubsonicErrorResponse | Error | null;
  isEmpty: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}

export default function HomeSection({
  title,
  seeAllHref,
  isLoading,
  error,
  isEmpty,
  skeleton,
  children,
}: HomeSectionProps) {
  const { t } = useTranslation();
  return (
    <Box>
      <Box className="px-6 mt-4 mb-4">
        <HStack className="items-center justify-between gap-x-4">
          <Heading
            numberOfLines={2}
            className="text-white truncate flex-1"
            size="xl"
          >
            {title}
          </Heading>
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
