import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import CircleMinus from "lucide-react-native/dist/esm/icons/circle-minus.mjs";
import CirclePlus from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import type { PodcastSeries } from "@/services/taddyPodcasts/types";
import usePodcasts from "@/stores/podcasts";

export interface PodcastEpisodeActionsTarget {
  uuid: string;
  name: string;
  imageUrl?: string;
  podcastSeries: PodcastSeries;
  seriesName?: string;
}

interface PodcastEpisodeActionsApi {
  open: (episode: PodcastEpisodeActionsTarget) => void;
}

const PodcastEpisodeActionsContext =
  createContext<PodcastEpisodeActionsApi | null>(null);

export function usePodcastEpisodeActions(): PodcastEpisodeActionsApi {
  const ctx = useContext(PodcastEpisodeActionsContext);
  if (!ctx) {
    throw new Error(
      "usePodcastEpisodeActions must be used within a PodcastEpisodeActionsProvider",
    );
  }
  return ctx;
}

export function PodcastEpisodeActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [white, gray200] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const addFavoritePodcast = usePodcasts((store) => store.addFavoritePodcast);
  const removeFavoritePodcast = usePodcasts(
    (store) => store.removeFavoritePodcast,
  );
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);

  const [episode, setEpisode] = useState<PodcastEpisodeActionsTarget | null>(
    null,
  );

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const open = useCallback((next: PodcastEpisodeActionsTarget) => {
    setEpisode(next);
    bottomSheetModalRef.current?.present();
  }, []);

  const series = episode?.podcastSeries;
  const isFavorite = series
    ? favoritePodcasts.some((fav) => fav.uuid === series.uuid)
    : false;
  const seriesName = episode?.seriesName ?? series?.name;

  const handleGoToPodcastSeriesPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (!series) return;
    router.navigate({
      pathname: "/podcast-series/[id]",
      params: {
        id: series.uuid,
        uuid: series.uuid,
        name: series.name,
        description: series.description,
        imageUrl: series.imageUrl,
        authorName: series.authorName,
        genres: series.genres?.join(","),
      },
    });
  };

  const handleAddFavoritePodcastPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (!series) return;
    addFavoritePodcast(series);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.podcasts.addToFavoritesSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleRemoveFavoritePodcastPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (!series) return;
    removeFavoritePodcast(series.uuid);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.podcasts.removeFromFavoritesSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  return (
    <PodcastEpisodeActionsContext.Provider value={{ open }}>
      {children}
      <CenteredBottomSheetModal
        ref={bottomSheetModalRef}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          {episode && (
            <Box className="p-6 w-full mb-12">
              <HStack className="items-center">
                {episode.imageUrl ? (
                  <Image
                    source={{ uri: episode.imageUrl }}
                    className="w-16 h-16 rounded-md aspect-square"
                    alt="Podcast cover"
                  />
                ) : (
                  <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                    <Podcast size={24} color={white} />
                  </Box>
                )}
                <VStack className="ml-4 flex-1">
                  <Heading
                    className="text-white font-normal"
                    size="lg"
                    numberOfLines={1}
                  >
                    {episode.name}
                  </Heading>
                  {seriesName && (
                    <Text
                      numberOfLines={1}
                      className="text-md text-primary-100"
                    >
                      {seriesName}
                    </Text>
                  )}
                </VStack>
              </HStack>
              <VStack className="mt-6 gap-y-8">
                {series && (
                  <FadeOutScaleDown onPress={handleGoToPodcastSeriesPress}>
                    <HStack className="items-center">
                      <Podcast size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.podcasts.goToPodcastSeries")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                {series &&
                  (isFavorite ? (
                    <FadeOutScaleDown
                      onPress={handleRemoveFavoritePodcastPress}
                    >
                      <HStack className="items-center">
                        <CircleMinus size={24} color={gray200} />
                        <Text className="ml-4 text-lg text-gray-200">
                          {t("app.podcasts.removeFromFavorites")}
                        </Text>
                      </HStack>
                    </FadeOutScaleDown>
                  ) : (
                    <FadeOutScaleDown onPress={handleAddFavoritePodcastPress}>
                      <HStack className="items-center">
                        <CirclePlus size={24} color={gray200} />
                        <Text className="ml-4 text-lg text-gray-200">
                          {t("app.podcasts.addToFavorites")}
                        </Text>
                      </HStack>
                    </FadeOutScaleDown>
                  ))}
              </VStack>
            </Box>
          )}
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
    </PodcastEpisodeActionsContext.Provider>
  );
}
