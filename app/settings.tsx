import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView>
      <ScrollView>
        <Box className="px-6 mt-6 mb-4">
          <HStack className="items-center">
            <FadeOutScaleDown onPress={() => router.back()}>
              <ArrowLeft size={24} color="white" />
            </FadeOutScaleDown>
            <Heading className="text-white ml-4" size="xl">
              Settings
            </Heading>
          </HStack>
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}
