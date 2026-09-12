import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import PlusCircle from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import ListStart from "lucide-react-native/dist/esm/icons/list-start.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  FLOATING_PLAYER_HEIGHT,
  SIDEBAR_WIDTH,
  TAB_BAR_CONTENT_HEIGHT,
} from "@/components/FloatingPlayer";
import { OFFLINE_BANNER_HEIGHT } from "@/components/OfflineBanner";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { usePlayingTrack } from "@/hooks/player";
import { useIsOnline } from "@/hooks/useIsOnline";
import useApp from "@/stores/app";
import useQueue from "@/stores/queue";
import useTrackSelection from "@/stores/trackSelection";
import { childToTrack } from "@/utils/childToTrack";
import { hidesFloatingPlayer } from "@/utils/floatingPlayerRoutes";
import { TOAST_DURATION } from "@/utils/toastDuration";

// Gap between the bar and whatever chrome sits below it.
const CHROME_GAP = 8;

// The bar's nominal height, used by useScreenBottomPadding until the bar has
// laid out once and published its real one. Both rows are sized to these
// numbers rather than to text metrics, so a longer translation scrolls (below)
// instead of pushing the box taller — but they are minimums, because a raised
// system font scale legitimately grows them.
const BAR_VERTICAL_PADDING = 12;
const COUNT_ROW_HEIGHT = 24;
const ROW_GAP = 16;
const ACTIONS_ROW_HEIGHT = 44;

export const TRACK_SELECTION_BAR_HEIGHT =
  BAR_VERTICAL_PADDING * 2 + COUNT_ROW_HEIGHT + ROW_GAP + ACTIONS_ROW_HEIGHT;

// Exported alongside the height so the padding hook reserves the same gap the
// bar itself sits at.
export const TRACK_SELECTION_BAR_GAP = CHROME_GAP;

// Width of the fade at whichever end of the action row has content scrolled
// past it. A mask rather than a gradient painted in the bar's own colour: the
// panel is bg-primary-600, which is a theme variable rather than a literal, and
// a fade drawn in the wrong colour is invisible.
const EDGE_FADE_WIDTH = 20;

// How close to an end counts as "there", in px — a scroll offset lands on
// fractional pixels, so an exact comparison would leave a fade hanging at rest.
const EDGE_EPSILON = 4;

const MASK_OPAQUE = "#000";
const MASK_CLEAR = "transparent";

// Routes the user comes back from with the same list still underneath.
const SELECTION_DETOUR_ROUTES = ["/player", "/lyrics"];

const isSelectionDetour = (pathname: string) =>
  SELECTION_DETOUR_ROUTES.includes(pathname);

// Bulk action bar for multi-select (issue #195). Mounted once at the (app)
// layout so every screen rendering TrackListItem gets it without wiring, the
// same way the floating player is mounted.
export default function TrackSelectionBar() {
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const isOnline = useIsOnline();
  const isWideLayout = useApp((state) => state.isWideLayout);
  const playingTrack = usePlayingTrack();

  // The bar is mounted at the (app) layout, alongside the floating player and
  // outside the tab navigator — so, like the player, it can't measure the tab
  // bar through BottomTabBarHeightContext and has to stack the same constants
  // by hand. It stops above the player rather than replacing it, so playback
  // stays reachable while a selection is open.
  const playerVisible = !!playingTrack && !hidesFloatingPlayer(pathname);
  const bottom = isWideLayout
    ? insets.bottom + 12
    : insets.bottom +
      TAB_BAR_CONTENT_HEIGHT +
      (isOnline ? 0 : OFFLINE_BANNER_HEIGHT) +
      (playerVisible ? FLOATING_PLAYER_HEIGHT + CHROME_GAP : CHROME_GAP);

  // The action labels are translated, and some locales need far more room than
  // the panel has (German's "Als Nächstes abspielen" alone is wider than a
  // third of a phone screen), so the row scrolls. Each edge is masked only
  // while there is content scrolled past it: a fade at rest would dim the
  // outer two actions for nothing, and padding them clear of it would break
  // their alignment with the count row above.
  const [actionsWidth, setActionsWidth] = useState(0);
  const [fade, setFade] = useState({ start: false, end: false });
  const scrollMetrics = useRef({ x: 0, width: 0, content: 0 });

  const updateFade = () => {
    const { x, width, content } = scrollMetrics.current;
    const start = x > EDGE_EPSILON;
    const end = content - width - x > EDGE_EPSILON;
    setFade((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  };

  const fadeFraction =
    actionsWidth > 0 ? Math.min(EDGE_FADE_WIDTH / actionsWidth, 0.5) : 0;

  const active = useTrackSelection((state) => state.active);
  const selected = useTrackSelection((state) => state.selected);
  const hasPool = useTrackSelection((state) => state.pool.length > 0);

  // The bar is mounted once, at the (app) layout, for as long as the user is
  // signed in — so a selection that already exists when it mounts can only be a
  // leftover: Fast Refresh in the dev client keeps the store while remounting
  // the tree, and the app remounts on sign-in and on a server switch. A
  // selection is a gesture in progress; none of those should carry one over.
  useEffect(() => {
    if (useTrackSelection.getState().active) {
      useTrackSelection.getState().exit();
    }
  }, []);

  // Every action hands its payload over synchronously — the playlist ids travel
  // as route params — so a selection never needs to outlive the navigation that
  // consumes it, and leaving the screen it was made on clears it.
  //
  // The player and the lyrics screen are the exception: the bar deliberately
  // stops above the player rather than replacing it, so tapping it is a detour
  // the user returns from, not a change of context. Dropping a 40-track
  // selection for that would punish the one thing the layout invites.
  //
  // The origin is captured when the selection opens rather than tracked on
  // every navigation: a ref that simply followed the pathname would, on the
  // next screen, cancel a fresh selection the moment it was made.
  const selectionOrigin = useRef<string | null>(null);
  useEffect(() => {
    if (!active) {
      selectionOrigin.current = null;
      return;
    }
    if (selectionOrigin.current === null) {
      selectionOrigin.current = pathname;
      return;
    }
    if (pathname === selectionOrigin.current || isSelectionDetour(pathname)) {
      return;
    }
    useTrackSelection.getState().exit();
  }, [active, pathname]);

  if (!active) return null;

  const handleAddToPlaylistPress = () => {
    if (selected.length === 0) return;
    const ids = selected.map((track) => track.id);
    useTrackSelection.getState().exit();
    router.navigate({
      pathname: "/playlists/add-to-playlist",
      params: { ids },
    });
  };

  const showQueueToast = (message: string) => {
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.default,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>{message}</ToastDescription>
        </Toast>
      ),
    });
  };

  const handlePlayNextPress = () => {
    const added = useQueue.getState().enqueueNext(selected.map(childToTrack));
    useTrackSelection.getState().exit();
    if (added === 0) return;
    showQueueToast(t("app.shared.addedToPlayNextMessage", { count: added }));
  };

  const handleAddToQueuePress = () => {
    const added = useQueue.getState().enqueueEnd(selected.map(childToTrack));
    useTrackSelection.getState().exit();
    if (added === 0) return;
    showQueueToast(t("app.shared.addedToQueueMessage", { count: added }));
  };

  const disabled = selected.length === 0;

  return (
    <Box
      testID="track-selection-bar"
      className="absolute right-0"
      // In landscape the player and nav dock into the left sidebar, so the bar
      // starts where the content does instead of covering them.
      style={{ bottom, left: isWideLayout ? SIDEBAR_WIDTH : 0 }}
    >
      <Box
        className="mx-2 px-4 rounded-md bg-primary-600"
        style={{ paddingVertical: BAR_VERTICAL_PADDING }}
        onLayout={(event) =>
          useTrackSelection
            .getState()
            .setBarHeight(event.nativeEvent.layout.height)
        }
      >
        <HStack
          className="items-center justify-between"
          style={{ minHeight: COUNT_ROW_HEIGHT }}
        >
          <Text className="text-white font-bold" numberOfLines={1}>
            {t("app.tracks.selection.selectedCount", {
              count: selected.length,
            })}
          </Text>
          <HStack className="items-center gap-x-4">
            {hasPool && (
              <FadeOutScaleDown
                testID="track-selection-select-all"
                onPress={() => useTrackSelection.getState().selectAll()}
              >
                <Text className="text-emerald-400">
                  {t("app.tracks.selection.selectAll")}
                </Text>
              </FadeOutScaleDown>
            )}
            {!disabled && (
              <FadeOutScaleDown
                testID="track-selection-deselect-all"
                onPress={() => useTrackSelection.getState().deselectAll()}
              >
                <Text className="text-emerald-400">
                  {t("app.tracks.selection.deselectAll")}
                </Text>
              </FadeOutScaleDown>
            )}
            <FadeOutScaleDown
              testID="track-selection-close"
              onPress={() => useTrackSelection.getState().exit()}
            >
              <X size={24} color={gray200} />
            </FadeOutScaleDown>
          </HStack>
        </HStack>
        <MaskedView
          style={{ minHeight: ACTIONS_ROW_HEIGHT, marginTop: ROW_GAP }}
          onLayout={(event) => {
            scrollMetrics.current.width = event.nativeEvent.layout.width;
            setActionsWidth(event.nativeEvent.layout.width);
            updateFade();
          }}
          maskElement={
            <LinearGradient
              colors={[
                fade.start ? MASK_CLEAR : MASK_OPAQUE,
                MASK_OPAQUE,
                MASK_OPAQUE,
                fade.end ? MASK_CLEAR : MASK_OPAQUE,
              ]}
              locations={[0, fadeFraction, 1 - fadeFraction, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          }
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(event) => {
              scrollMetrics.current.x = event.nativeEvent.contentOffset.x;
              updateFade();
            }}
            onContentSizeChange={(width) => {
              scrollMetrics.current.content = width;
              updateFade();
            }}
            contentContainerStyle={{
              // Spread across the bar the way the fixed row did while the
              // labels fit, so the first and last action stay flush with the
              // count and the close button above them; overflow turns the same
              // content into a scroller.
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "space-between",
              columnGap: 24,
            }}
          >
            <FadeOutScaleDown
              testID="track-selection-add-to-playlist"
              onPress={handleAddToPlaylistPress}
              disabled={disabled}
            >
              <HStack className="items-center justify-center">
                <PlusCircle size={20} color={gray200} />
                <Text className="ml-2 text-gray-200" numberOfLines={1}>
                  {t("app.tracks.addToPlaylist")}
                </Text>
              </HStack>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              testID="track-selection-play-next"
              onPress={handlePlayNextPress}
              disabled={disabled}
            >
              <HStack className="items-center justify-center">
                <ListStart size={20} color={gray200} />
                <Text className="ml-2 text-gray-200" numberOfLines={1}>
                  {t("app.tracks.playNext")}
                </Text>
              </HStack>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              testID="track-selection-add-to-queue"
              onPress={handleAddToQueuePress}
              disabled={disabled}
            >
              <HStack className="items-center justify-center">
                <ListPlus size={20} color={gray200} />
                <Text className="ml-2 text-gray-200" numberOfLines={1}>
                  {t("app.tracks.addToQueue")}
                </Text>
              </HStack>
            </FadeOutScaleDown>
          </ScrollView>
        </MaskedView>
      </Box>
    </Box>
  );
}
