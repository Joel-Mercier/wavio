import type { ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

export function SettingsSectionTitle({
  title,
  onLayout,
}: {
  title: string;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <Heading className="text-white mt-4" size="lg" onLayout={onLayout}>
      {title}
    </Heading>
  );
}

export function SettingsToggleRow({
  label,
  description,
  value,
  onToggle,
  children,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  children?: ReactNode;
}) {
  const [gray500, emerald500, white] = Uniwind.getCSSVariable([
    "--color-gray-500",
    "--color-emerald-500",
    "--color-white",
  ]) as string[];
  return (
    <HStack className="items-center gap-x-4 py-4 justify-between">
      <VStack className="gap-y-2 w-3/5">
        <Heading className="text-white font-normal" size="md">
          {label}
        </Heading>
        <Text className="text-primary-100 text-sm">{description}</Text>
        {children}
      </VStack>
      <Switch
        size="md"
        trackColor={{
          false: gray500,
          true: emerald500,
        }}
        thumbColor={white}
        ios_backgroundColor={white}
        value={value}
        onToggle={onToggle}
      />
    </HStack>
  );
}

export function SettingsActionRow({
  label,
  description,
  actionLabel,
  onPress,
  variant = "primary",
  layout = "split",
}: {
  label: string;
  description: string;
  actionLabel: string;
  onPress: () => void;
  variant?: "primary" | "danger";
  layout?: "split" | "wide";
}) {
  const buttonColor =
    variant === "danger"
      ? "border-red-500 bg-red-500"
      : "border-emerald-500 bg-emerald-500";
  if (layout === "wide") {
    return (
      <HStack className="items-center gap-x-4 py-4 justify-between">
        <VStack className="gap-y-2 w-3/5">
          <Heading className="text-white font-normal" size="md">
            {label}
          </Heading>
          <Text className="text-primary-100 text-sm">{description}</Text>
        </VStack>
        <FadeOutScaleDown
          onPress={onPress}
          className={cn(
            "items-center justify-center py-2 px-8 border rounded-full",
            buttonColor,
          )}
        >
          <Text className="text-primary-800 font-bold text-lg">
            {actionLabel}
          </Text>
        </FadeOutScaleDown>
      </HStack>
    );
  }
  return (
    <HStack className="items-center gap-x-4 py-4 justify-between flex-1">
      <VStack className="gap-y-2 w-1/2">
        <Heading className="text-white font-normal" size="md">
          {label}
        </Heading>
        <Text className="text-primary-100 text-sm">{description}</Text>
      </VStack>
      <FadeOutScaleDown
        onPress={onPress}
        className={cn(
          "flex-1 items-center justify-center py-2 px-8 border rounded-full",
          buttonColor,
        )}
      >
        <Text numberOfLines={1} className="text-primary-800 font-bold text-lg">
          {actionLabel}
        </Text>
      </FadeOutScaleDown>
    </HStack>
  );
}

export function SettingsSelectRow({
  label,
  description,
  badgeText,
  onPress,
  disabled = false,
}: {
  label: string;
  description: string;
  badgeText: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <FadeOutScaleDown onPress={onPress} disabled={disabled}>
      <HStack className="items-center gap-x-4 py-4 justify-between">
        <VStack className="gap-y-2 w-1/2">
          <Heading className="text-white font-normal" size="md">
            {label}
          </Heading>
          <Text className="text-primary-100 text-sm">{description}</Text>
        </VStack>
        <Badge
          className="rounded-full normal-case py-1 px-3 bg-emerald-100"
          size="lg"
          variant="solid"
          action="success"
        >
          <BadgeText className="normal-case text-center text-emerald-700">
            {badgeText}
          </BadgeText>
        </Badge>
      </HStack>
    </FadeOutScaleDown>
  );
}

export function SettingsStepperRow({
  label,
  description,
  valueText,
  onDecrement,
  onIncrement,
  valueClassName,
}: {
  label: string;
  description: string;
  valueText: string;
  onDecrement: () => void;
  onIncrement: () => void;
  valueClassName?: string;
}) {
  return (
    <HStack className="items-center gap-x-4 py-4 justify-between">
      <VStack className="gap-y-2 w-1/2">
        <Heading className="text-white font-normal" size="md">
          {label}
        </Heading>
        <Text className="text-primary-100 text-sm">{description}</Text>
      </VStack>
      <HStack className="items-center gap-x-3">
        <FadeOutScaleDown
          onPress={onDecrement}
          className="items-center justify-center w-10 h-10 border border-emerald-500 bg-emerald-500 rounded-full"
        >
          <Text className="text-primary-800 font-bold text-lg">-</Text>
        </FadeOutScaleDown>
        <Text
          className={cn("text-white font-bold text-center", valueClassName)}
        >
          {valueText}
        </Text>
        <FadeOutScaleDown
          onPress={onIncrement}
          className="items-center justify-center w-10 h-10 border border-emerald-500 bg-emerald-500 rounded-full"
        >
          <Text className="text-primary-800 font-bold text-lg">+</Text>
        </FadeOutScaleDown>
      </HStack>
    </HStack>
  );
}
