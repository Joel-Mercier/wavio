import { useTranslation } from "react-i18next";
import { Center } from "@/components/ui/center";
import { Text } from "@/components/ui/text";

export default function EmptyDisplay({
  offline = false,
  hint,
}: {
  offline?: boolean;
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <Center className="my-4 px-6">
      <Text className="text-primary-100 text-md">
        {t(offline ? "app.shared.noDataOffline" : "app.shared.noData")}
      </Text>
      {hint && (
        <Text className="text-primary-300 text-sm text-center mt-2">
          {hint}
        </Text>
      )}
    </Center>
  );
}
