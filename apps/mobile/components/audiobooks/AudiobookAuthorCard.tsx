import type { Href } from "expo-router";
import UserRound from "lucide-react-native/icons/user-round";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { authorImageUrl } from "@/services/audiobookshelf/keys";
import useAudiobookshelf from "@/stores/audiobookshelf";
import { cn } from "@/utils/tailwind";

export function audiobookAuthorHref(authorId: string, name?: string): Href {
  return {
    pathname: "/audiobooks/authors/[id]",
    params: { id: authorId, name },
  };
}

export function AuthorAvatar({
  authorId,
  hasImage,
  size,
}: {
  authorId: string;
  hasImage: boolean;
  size: "sm" | "lg";
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const serverUrl = useAudiobookshelf((s) => s.serverUrl);
  const dimension = size === "sm" ? "w-16 h-16" : "w-32 h-32";
  const uri =
    hasImage && serverUrl ? authorImageUrl(serverUrl, authorId) : undefined;
  return (
    <ImageWithFallback
      source={uri ? { uri } : undefined}
      className={cn(dimension, "rounded-full aspect-square")}
      alt=""
      contentFit="cover"
      fallback={
        <Box
          className={cn(
            dimension,
            "rounded-full bg-primary-600 items-center justify-center",
          )}
        >
          <UserRound size={size === "sm" ? 24 : 40} color={white} />
        </Box>
      }
    />
  );
}

function AudiobookAuthorCard({
  authorId,
  name,
  hasImage,
  bookCount,
  layout = "horizontal",
}: {
  authorId: string;
  name: string;
  hasImage: boolean;
  bookCount?: number;
  layout?: "horizontal" | "vertical";
}) {
  const { t } = useTranslation();
  const vertical = layout === "vertical";
  return (
    <FadeOutScaleDown
      href={audiobookAuthorHref(authorId, name)}
      className={cn(vertical ? "px-6 py-2" : "mr-6")}
    >
      <VStack
        className={cn(
          "gap-y-2",
          vertical ? "flex-row items-center" : "w-32 items-center",
        )}
      >
        <AuthorAvatar
          authorId={authorId}
          hasImage={hasImage}
          size={vertical ? "sm" : "lg"}
        />
        <VStack className={cn(vertical ? "flex-1 ml-4" : "items-center")}>
          <Heading
            size={vertical ? "md" : "sm"}
            className={cn("text-white", !vertical && "text-center")}
            numberOfLines={2}
          >
            {name}
          </Heading>
          {bookCount != null && (
            <Text numberOfLines={1} className="text-sm text-primary-100">
              {t("app.audiobooks.bookCount", { count: bookCount })}
            </Text>
          )}
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default memo(AudiobookAuthorCard);
