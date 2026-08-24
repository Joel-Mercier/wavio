import CircleX from "lucide-react-native/dist/esm/icons/circle-x.mjs";
import Clock from "lucide-react-native/dist/esm/icons/clock.mjs";
import WifiOff from "lucide-react-native/dist/esm/icons/wifi-off.mjs";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { isNetworkNoise } from "@/services/errorReporting";
import type { StatsResult } from "@/services/listenBrainz/stats";

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
 * One titled section of the stats screen, owning the four states a statistic
 * can be in.
 *
 * The one that matters is `notComputed`: ListenBrainz answers `204 No Content`
 * until its batch job has run for this user and range, and that happens
 * routinely — a busy account still has no `week` figures. Collapsing it into an
 * empty state would tell the user they have listened to nothing.
 */
export default function StatsSection<T>({
  title,
  description,
  query,
  isEmpty,
  skeleton,
  children,
}: {
  title: string;
  // For sections whose axes aren't self-evident, or that read differently from
  // how the range picker above them suggests.
  description?: string;
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
  const { t } = useTranslation();
  const key = "app.settings.integrations.listenbrainz.stats";

  const body = () => {
    if (query.isPending) return skeleton;
    if (query.error) {
      return isNetworkNoise(query.error) ? (
        <Notice icon={WifiOff} title={t(`${key}.unreachable`)} />
      ) : (
        <Notice
          icon={CircleX}
          title={
            query.error instanceof Error
              ? query.error.message
              : t(`${key}.unreachable`)
          }
        />
      );
    }
    if (!query.data || query.data.state === "notComputed") {
      return (
        <Notice
          icon={Clock}
          title={t(`${key}.notComputed`)}
          description={t(`${key}.notComputedDescription`)}
        />
      );
    }
    if (isEmpty(query.data.data)) {
      return <Notice icon={Clock} title={t(`${key}.noListens`)} />;
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
