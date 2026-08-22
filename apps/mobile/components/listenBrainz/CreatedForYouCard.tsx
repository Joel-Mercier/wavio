import CalendarDays from "lucide-react-native/dist/esm/icons/calendar-days.mjs";
import Compass from "lucide-react-native/dist/esm/icons/compass.mjs";
import Sun from "lucide-react-native/dist/esm/icons/sun.mjs";
import type { ComponentType } from "react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type {
  CreatedForPatch,
  ListenBrainzPlaylistSummary,
} from "@/services/listenBrainz/types";

// The createdfor response carries no tracks, so there is no cover art to show
// without fetching all three full playlists on the home screen — which is the
// one cost this section exists to avoid. An icon tile per generator is instant,
// works offline, and reads as "made for you" rather than as a real playlist.
const PATCH_STYLE: Record<
  CreatedForPatch,
  { Icon: ComponentType<{ size?: number; color?: string }>; className: string }
> = {
  "daily-jams": { Icon: Sun, className: "bg-emerald-600" },
  "weekly-jams": { Icon: CalendarDays, className: "bg-indigo-600" },
  "weekly-exploration": { Icon: Compass, className: "bg-fuchsia-700" },
};

const I18N_KEY: Record<CreatedForPatch, string> = {
  "daily-jams": "dailyJams",
  "weekly-jams": "weeklyJams",
  "weekly-exploration": "weeklyExploration",
};

function CreatedForYouCard({
  playlist,
}: {
  playlist: ListenBrainzPlaylistSummary;
}) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { Icon, className } = PATCH_STYLE[playlist.patch];
  const key = I18N_KEY[playlist.patch];

  return (
    <FadeOutScaleDown
      href={{
        pathname: "/integrations/listenbrainz-playlist/[mbid]",
        params: { mbid: playlist.mbid, patch: playlist.patch },
      }}
      className="mr-6"
    >
      <VStack className="gap-y-2 w-32">
        <Box
          className={`w-32 h-32 rounded-md aspect-square items-center justify-center ${className}`}
        >
          <Icon size={48} color={white} />
        </Box>
        <VStack>
          <Heading size="sm" className="text-white" numberOfLines={1}>
            {t(`app.settings.integrations.listenbrainz.createdForYou.${key}`)}
          </Heading>
          <Text numberOfLines={2} className="text-md text-primary-100">
            {t(
              `app.settings.integrations.listenbrainz.createdForYou.${key}Description`,
            )}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default memo(CreatedForYouCard);
