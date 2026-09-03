import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";

interface RuleConnectorProps {
  combinator: "all" | "any";
}

export default function RuleConnector({ combinator }: RuleConnectorProps) {
  const { t } = useTranslation();

  return (
    <Text className="text-primary-100 text-xs uppercase font-bold text-center mb-3">
      {combinator === "all"
        ? t("app.smartPlaylist.and")
        : t("app.smartPlaylist.or")}
    </Text>
  );
}
