import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ActivityGroupItem from "@/components/activity/ActivityGroupItem";
import LastFmActivityTab from "@/components/activity/LastFmActivityTab";
import ListenBrainzActivityTab from "@/components/activity/ListenBrainzActivityTab";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import TabBar, { type TabBarItem } from "@/components/TabBar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { hasLastFmCredentials } from "@/services/lastFm/config";
import useActivity, { type ActivitySource } from "@/stores/activity";
import useApp from "@/stores/app";
import {
  type ActivityGroup,
  type ActivitySectionKey,
  groupActivity,
} from "@/utils/activityGrouping";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

type ActivityTab = "history" | "listenbrainz" | "lastfm";

// A build without Last.fm API credentials can't connect an account, so the tab
// would only ever offer a connect button that leads nowhere.
const TABS: ActivityTab[] = hasLastFmCredentials()
  ? ["history", "listenbrainz", "lastfm"]
  : ["history", "listenbrainz"];

const TAB_TITLE_KEYS: Record<ActivityTab, string> = {
  history: "app.activity.tabs.history",
  listenbrainz: "app.settings.integrations.listenbrainz.title",
  lastfm: "app.settings.integrations.lastfm.title",
};

type Row =
  | { kind: "sectionHeader"; key: string; sectionKey: ActivitySectionKey }
  | { kind: "group"; key: string; group: ActivityGroup };

export default function ActivityDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const activity = useActivity((store) => store.activity);

  const [activeTab, setActiveTab] = useState<ActivityTab>("history");
  const [visitedTabs, setVisitedTabs] = useState<Set<ActivityTab>>(
    () => new Set(["history"]),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tabs = useMemo<TabBarItem[]>(
    () => TABS.map((key) => ({ key, title: t(TAB_TITLE_KEYS[key]) })),
    [t],
  );

  const handleTabPress = useCallback((index: number) => {
    const tab = TABS[index];
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, []);

  // Stats tabs mount on first visit and then stay mounted (hidden) so their
  // period picker and scroll position survive a trip to another tab.
  const renderStatsTab = (tab: ActivityTab, content: ReactNode) =>
    visitedTabs.has(tab) && (
      <Box
        className="flex-1"
        style={{ display: activeTab === tab ? "flex" : "none" }}
      >
        {content}
      </Box>
    );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const section of groupActivity(activity)) {
      out.push({
        kind: "sectionHeader",
        key: `header:${section.key}`,
        sectionKey: section.key,
      });
      for (const group of section.groups) {
        out.push({ kind: "group", key: group.key, group });
      }
    }
    return out;
  }, [activity]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handlePressSource = useCallback(
    (source: NonNullable<ActivitySource>) => {
      switch (source.type) {
        case "album":
          router.navigate(`/albums/${source.id}`);
          break;
        case "artist":
          router.navigate(`/artists/${source.id}`);
          break;
        case "playlist":
          router.navigate(`/playlists/${source.id}`);
          break;
      }
    },
    [router],
  );

  const renderHistory = () =>
    activity.length === 0 ? (
      <VStack className="flex-1 items-center justify-center">
        <Text className="text-primary-100 text-center">
          {t("app.activity.empty")}
        </Text>
      </VStack>
    ) : (
      <LegendList
        recycleItems
        data={rows}
        extraData={expanded}
        keyExtractor={(row) => row.key}
        getItemType={(row) =>
          row.kind === "sectionHeader"
            ? "header"
            : `group-${expanded.has(row.group.key)}`
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        renderItem={({ item }) =>
          item.kind === "sectionHeader" ? (
            <Heading className="text-white mt-6 mb-2" size="md">
              {t(`app.activity.sections.${item.sectionKey}`)}
            </Heading>
          ) : (
            <ActivityGroupItem
              group={item.group}
              isExpanded={expanded.has(item.group.key)}
              onToggle={() => toggle(item.group.key)}
              onPressSource={handlePressSource}
            />
          )
        }
      />
    );

  return (
    <Box className="h-full">
      <Box className={cn("pb-6 flex-1", isWideLayout ? "mb-6" : "mt-6")}>
        <HStack
          className="items-center mb-6 px-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white text-center truncate flex-1" size="lg">
            {t("app.activity.title")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        <TabBar
          tabs={tabs}
          activeIndex={TABS.indexOf(activeTab)}
          onTabPress={handleTabPress}
          className="mb-2"
        />
        <Box className="px-6 flex-1">
          {activeTab === "history" && renderHistory()}
          {renderStatsTab(
            "listenbrainz",
            <ListenBrainzActivityTab isActive={activeTab === "listenbrainz"} />,
          )}
          {renderStatsTab(
            "lastfm",
            <LastFmActivityTab isActive={activeTab === "lastfm"} />,
          )}
        </Box>
      </Box>
    </Box>
  );
}
