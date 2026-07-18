import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ActivityGroupItem from "@/components/activity/ActivityGroupItem";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import useActivity, { type ActivitySource } from "@/stores/activity";
import useApp from "@/stores/app";
import {
  type ActivityGroup,
  type ActivitySectionKey,
  groupActivity,
} from "@/utils/activityGrouping";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

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

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  return (
    <Box className="h-full">
      <Box className={cn("px-6 pb-6 flex-1", isWideLayout ? "mb-6" : "mt-6")}>
        <HStack
          className="items-center mb-6"
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
        {activity.length === 0 ? (
          <VStack className="flex-1 items-center justify-center">
            <Text className="text-primary-100 text-center">
              {t("app.activity.empty")}
            </Text>
          </VStack>
        ) : (
          <FlashList
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
        )}
      </Box>
    </Box>
  );
}
