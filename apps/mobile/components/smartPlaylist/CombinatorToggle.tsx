import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";

interface CombinatorToggleProps {
  combinator: "all" | "any";
  onCombinatorChange: (c: "all" | "any") => void;
  className?: string;
}

export default function CombinatorToggle({
  combinator,
  onCombinatorChange,
  className = "bg-primary-700",
}: CombinatorToggleProps) {
  const { t } = useTranslation();

  return (
    <HStack className={`rounded-full p-1 ${className}`}>
      <FadeOutScaleDown
        onPress={() => onCombinatorChange("all")}
        className={`flex-1 items-center py-2 rounded-full ${combinator === "all" ? "bg-emerald-500" : ""}`}
      >
        <Text
          className={`font-bold ${combinator === "all" ? "text-primary-800" : "text-white"}`}
        >
          {t("app.smartPlaylist.matchAll")}
        </Text>
      </FadeOutScaleDown>
      <FadeOutScaleDown
        onPress={() => onCombinatorChange("any")}
        className={`flex-1 items-center py-2 rounded-full ${combinator === "any" ? "bg-emerald-500" : ""}`}
      >
        <Text
          className={`font-bold ${combinator === "any" ? "text-primary-800" : "text-white"}`}
        >
          {t("app.smartPlaylist.matchAny")}
        </Text>
      </FadeOutScaleDown>
    </HStack>
  );
}
