import { Center } from "@/components/ui/center";
import { Text } from "@/components/ui/text";

export default function EmptyDisplay() {
  return (
    <Center className="my-4">
      <Text className="text-primary-100 text-md">No data</Text>
    </Center>
  );
}
