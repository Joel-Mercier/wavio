import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { themeConfig } from "@/config/theme";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Search } from "lucide-react-native";

export default function SearchScreen() {
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <Box>
      <SafeAreaView>
        <HStack className="my-6 px-6 items-center justify-between">
          <Heading className="text-white" size="2xl">
            Search
          </Heading>
        </HStack>
        <Pressable className="px-6">
          {({ pressed }) => (
            <Input
              size="xl"
              isReadOnly
              className="bg-white rounded-md border-0"
            >
              <InputSlot className="pl-3">
                <InputIcon as={Search} color={themeConfig.theme.colors.black} />
              </InputSlot>
              <InputField placeholder="What do you want to listen to ?" />
            </Input>
          )}
        </Pressable>
      </SafeAreaView>
    </Box>
  );
}
