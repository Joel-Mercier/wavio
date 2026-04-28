import { useTranslation } from "react-i18next";
import { Center } from "@/components/ui/center";
import { Text } from "@/components/ui/text";

export default function EmptyDisplay() {
  const { t } = useTranslation();
  return (
    <Center className="my-4">
      <Text className="text-primary-100 text-md">{t("app.shared.noData")}</Text>
    </Center>
  );
}
