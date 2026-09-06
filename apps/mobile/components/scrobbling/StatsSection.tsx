import CircleX from "lucide-react-native/dist/esm/icons/circle-x.mjs";
import Clock from "lucide-react-native/dist/esm/icons/clock.mjs";
import WifiOff from "lucide-react-native/dist/esm/icons/wifi-off.mjs";
import type { ComponentType, ReactNode } from "react";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { isNetworkNoise } from "@/services/errorReporting";
import type { StatsResult } from "@/services/scrobbling/stats";

// Inline rather than the shared ErrorDisplay: that one fills its parent and
// offers a "back to home" button, which makes sense for a whole screen but not
// for one of six stacked sections inside a ScrollView.
function Notice({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <HStack className="items-start gap-x-3 py-4">
      <Icon size={18} color="rgb(163, 163, 163)" />
      <VStack className="flex-1 gap-y-1">
        <Text className="text-primary-100 text-sm">{title}</Text>
        {description && (
          <Text className="text-primary-300 text-xs">{description}</Text>
        )}
      </VStack>
    </HStack>
  );
}

/**
 * The already-translated strings a section needs for its non-data states.
 *
 * Passed in rather than read from a fixed i18n namespace so the same section can
 * serve both scrobbling services: their copy differs, and each one's strings are
 * already translated where they are. `notComputed` is optional because only
 * ListenBrainz has that state — Last.fm computes on read.
 */
export type StatsSectionLabels = {
  unreachable: string;
  noData: string;
  notComputed?: { title: string; description: string };
};

/**
 * One titled section of a stats screen, owning the four states a statistic can
 * be in.
 *
 * The one that matters is `notComputed`: ListenBrainz answers `204 No Content`
 * until its batch job has run for this user and range, and that happens
 * routinely — a busy account still has no `week` figures. Collapsing it into an
 * empty state would tell the user they have listened to nothing.
 */
export default function StatsSection<T>({
  title,
  description,
  labels,
  query,
  isEmpty,
  skeleton,
  children,
}: {
  title: string;
  // For sections whose axes aren't self-evident, or that read differently from
  // how the range picker above them suggests.
  description?: string;
  labels: StatsSectionLabels;
  query: {
    isPending: boolean;
    // `unknown`, as react-query types it — a queryFn can reject with anything.
    error: unknown;
    data?: StatsResult<T>;
  };
  isEmpty: (data: T) => boolean;
  skeleton: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const body = () => {
    if (query.isPending) return skeleton;
    if (query.error) {
      return isNetworkNoise(query.error) ? (
        <Notice icon={WifiOff} title={labels.unreachable} />
      ) : (
        <Notice
          icon={CircleX}
          title={
            query.error instanceof Error
              ? query.error.message
              : labels.unreachable
          }
        />
      );
    }
    if (!query.data || query.data.state === "notComputed") {
      // A service with no batch job (Last.fm) leaves `notComputed` unset, so
      // the missing data reads as "nothing to show" rather than "not ready yet".
      return labels.notComputed ? (
        <Notice
          icon={Clock}
          title={labels.notComputed.title}
          description={labels.notComputed.description}
        />
      ) : (
        <Notice icon={Clock} title={labels.noData} />
      );
    }
    if (isEmpty(query.data.data)) {
      return <Notice icon={Clock} title={labels.noData} />;
    }
    return children(query.data.data);
  };

  return (
    <VStack className="gap-y-2">
      <Heading className="text-white mt-4" size="lg">
        {title}
      </Heading>
      {description && (
        <Text className="text-primary-300 text-xs">{description}</Text>
      )}
      {body()}
    </VStack>
  );
}
