import { useTranslation } from "react-i18next";
import { Center } from "@/components/ui/center";
import { Text } from "@/components/ui/text";

export default function EmptyDisplay({
  offline = false,
}: {
  offline?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Center className="my-4">
      <Text className="text-primary-100 text-md">
        {t(offline ? "app.shared.noDataOffline" : "app.shared.noData")}
      </Text>
    </Center>
  );
}
