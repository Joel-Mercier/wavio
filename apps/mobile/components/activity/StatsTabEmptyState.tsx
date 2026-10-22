import type { ComponentProps } from "react";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

export default function StatsTabEmptyState({
  message,
  actionLabel,
  href,
  primary = false,
}: {
  message: string;
  actionLabel: string;
  href: ComponentProps<typeof FadeOutScaleDown>["href"];
  primary?: boolean;
}) {
  return (
    <VStack className="flex-1 items-center justify-center gap-y-6">
      <Text className="text-primary-100 text-center">{message}</Text>
      <FadeOutScaleDown
        href={href}
        className={cn(
          "items-center justify-center py-3 px-8 rounded-full border",
          primary
            ? "border-emerald-500 bg-emerald-500"
            : "border-primary-100 bg-transparent",
        )}
      >
        <Text
          className={cn(
            "font-bold text-lg",
            primary ? "text-primary-800" : "text-white",
          )}
        >
          {actionLabel}
        </Text>
      </FadeOutScaleDown>
    </VStack>
  );
}
