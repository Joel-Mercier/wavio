import { Paths } from "expo-file-system";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { getPersistedCacheSize } from "@/config/queryClient";
import { useTotalDownloadSize } from "@/hooks/useOfflineDownloads";
import { niceBytes } from "@/utils/fileSize";

// Bumped by the parent after clear-cache / clear-downloads so the bar recomputes
// the (non-reactive) persisted cache + disk-space readings.
interface StorageOverviewProps {
  refreshToken?: number;
}

type Segment = {
  key: string;
  label: string;
  bytes: number;
  // Tailwind background class for the bar segment + legend dot.
  color: string;
};

export default function StorageOverview({
  refreshToken,
}: StorageOverviewProps) {
  const { t } = useTranslation();
  const downloadsBytes = useTotalDownloadSize();

  const { total, segments } = useMemo(() => {
    // refreshToken participates in the dependency list so the values re-read
    // after the parent signals a change.
    void refreshToken;
    const total = Paths.totalDiskSpace || 0;
    const available = Paths.availableDiskSpace || 0;
    const cacheBytes = getPersistedCacheSize();
    const otherBytes = Math.max(
      0,
      total - available - downloadsBytes - cacheBytes,
    );

    const segments: Segment[] = [
      {
        key: "downloads",
        label: t("app.settings.storageSettings.downloads"),
        bytes: downloadsBytes,
        color: "bg-emerald-500",
      },
      {
        key: "cache",
        label: t("app.settings.storageSettings.cache"),
        bytes: cacheBytes,
        color: "bg-blue-500",
      },
      {
        key: "other",
        label: t("app.settings.storageSettings.otherAppData"),
        bytes: otherBytes,
        color: "bg-primary-300",
      },
      {
        key: "available",
        label: t("app.settings.storageSettings.available"),
        bytes: available,
        color: "bg-primary-600",
      },
    ];
    return { total, segments };
  }, [downloadsBytes, refreshToken, t]);

  if (total <= 0) return null;

  return (
    <VStack className="py-4 gap-y-4">
      <HStack className="h-3 rounded-full overflow-hidden w-full">
        {segments.map((segment) => {
          const flex = segment.bytes / total;
          if (flex <= 0) return null;
          return (
            <Box
              key={segment.key}
              className={segment.color}
              style={{ flexGrow: flex, flexShrink: 1, flexBasis: 0 }}
            />
          );
        })}
      </HStack>
      <VStack className="gap-y-2">
        {segments.map((segment) => (
          <HStack key={segment.key} className="items-center justify-between">
            <HStack className="items-center gap-x-2">
              <Box className={`size-3 rounded-full ${segment.color}`} />
              <Text className="text-primary-100 text-sm">{segment.label}</Text>
            </HStack>
            <Text className="text-white text-sm">
              {niceBytes(segment.bytes)}
            </Text>
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}
