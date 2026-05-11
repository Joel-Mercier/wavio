import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { isThisWeek, isToday, isYesterday } from "date-fns";
import { useRouter } from "expo-router";
import { ArrowLeft, Disc3, ListMusic, Mic2 } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SectionList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import ActivityListItem from "@/components/activity/ActivityListItem";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import useActivity, {
  type ActivityEntry,
  type ActivityType,
} from "@/stores/activity";

type SectionKey = "today" | "yesterday" | "thisWeek" | "older";

const groupEntries = (
  entries: ActivityEntry[],
): { key: SectionKey; data: ActivityEntry[] }[] => {
  const buckets: Record<SectionKey, ActivityEntry[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };
  for (const entry of entries) {
    const date = new Date(entry.playedAt);
    if (isToday(date)) buckets.today.push(entry);
    else if (isYesterday(date)) buckets.yesterday.push(entry);
    else if (isThisWeek(date, { weekStartsOn: 1 }))
      buckets.thisWeek.push(entry);
    else buckets.older.push(entry);
  }
  const order: SectionKey[] = ["today", "yesterday", "thisWeek", "older"];
  return order
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, data: buckets[key] }));
};

const routeFor = (entry: ActivityEntry) =>
  `/${entry.type}s/${entry.id}` as const;

const TypeIcon = ({ type }: { type: ActivityType }) => {
  const [color] = Uniwind.getCSSVariable(["--color-primary-100"]) as string[];
  if (type === "album") return <Disc3 size={14} color={color} />;
  if (type === "artist") return <Mic2 size={14} color={color} />;
  return <ListMusic size={14} color={color} />;
};

export default function ActivityDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const activity = useActivity((store) => store.activity);

  const sections = useMemo(() => groupEntries(activity), [activity]);

  const handlePress = (entry: ActivityEntry) => {
    router.navigate(routeFor(entry));
  };

  return (
    <Box className="h-full">
      <Box className="px-6 mt-6 pb-6 flex-1">
        <HStack
          className="items-center mb-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white text-center truncate flex-1" size="lg">
            {t("app.activity.title")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        {activity.length === 0 ? (
          <VStack className="flex-1 items-center justify-center">
            <Text className="text-primary-100 text-center">
              {t("app.activity.empty")}
            </Text>
          </VStack>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => `${item.type}:${item.id}:${item.playedAt}`}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{
              paddingBottom:
                insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
            }}
            renderSectionHeader={({ section }) => (
              <Heading className="text-white mt-6 mb-2" size="md">
                {t(`app.activity.sections.${section.key}`)}
              </Heading>
            )}
            renderItem={({ item }) => (
              <ActivityListItem item={item} onPress={handlePress} />
            )}
          />
        )}
      </Box>
    </Box>
  );
}
