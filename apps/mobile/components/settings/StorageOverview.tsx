import { Paths } from "expo-file-system";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { getPersistedCacheSize } from "@/config/queryClient";
import { useDownloadSizeByVolume } from "@/hooks/offline";
import { useLocalLibrarySize } from "@/hooks/useLocalLibrarySize";
import { filesAreOnDeviceType } from "@/services/backend/serverTraits";
import { useAuthBase } from "@/stores/auth";
import useTrackCache from "@/stores/trackCache";
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
  const filesOnDevice = useAuthBase((s) => filesAreOnDeviceType(s.serverType));
  // Downloads sent to a user-picked folder may not even be on the volume
  // Paths.totalDiskSpace measures (an SD card is the whole point of the
  // setting), so those bytes can't be subtracted from it. Split per record
  // rather than by the setting, which only governs *new* downloads: a library
  // written before a folder was picked is still sitting on this volume, and one
  // written to a folder on the device itself never left it.
  const { onVolume: downloadsBytes, offVolume: offVolumeBytes } =
    useDownloadSizeByVolume();
  const libraryBytes = useLocalLibrarySize();
  // Reactive, unlike the persisted-query-cache reading below: the prefetch cache
  // grows and evicts on its own while this screen is open.
  const prefetchBytes = useTrackCache((s) => s.totalBytes);

  const { total, segments } = useMemo(() => {
    // refreshToken participates in the dependency list so the values re-read
    // after the parent signals a change.
    void refreshToken;
    const total = Paths.totalDiskSpace || 0;
    const available = Paths.availableDiskSpace || 0;
    const cacheBytes = getPersistedCacheSize();
    // A library whose files are already on the device has no Wavio downloads;
    // the imported files are the app-attributable chunk of used disk instead,
    // so carve them out of "other".
    const firstSegment: Segment | null = filesOnDevice
      ? {
          key: "library",
          label: t("app.settings.storageSettings.importedLibrary"),
          bytes: libraryBytes,
          color: "bg-emerald-500",
        }
      : // Nothing on this volume to show, and bytes elsewhere that a "0 B"
        // row would misrepresent.
        downloadsBytes === 0 && offVolumeBytes > 0
        ? null
        : {
            key: "downloads",
            label: t("app.settings.storageSettings.downloads"),
            bytes: downloadsBytes,
            color: "bg-emerald-500",
          };
    const otherBytes = Math.max(
      0,
      total -
        available -
        (firstSegment?.bytes ?? 0) -
        cacheBytes -
        prefetchBytes,
    );

    const segments: Segment[] = [
      ...(firstSegment ? [firstSegment] : []),
      {
        key: "cache",
        label: t("app.settings.storageSettings.cache"),
        bytes: cacheBytes,
        color: "bg-blue-500",
      },
      {
        key: "prefetch",
        label: t("app.settings.storageSettings.prefetchCache"),
        bytes: prefetchBytes,
        color: "bg-amber-500",
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
  }, [
    downloadsBytes,
    offVolumeBytes,
    libraryBytes,
    prefetchBytes,
    filesOnDevice,
    refreshToken,
    t,
  ]);

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
