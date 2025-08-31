import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { VStack } from "@/components/ui/vstack";
import useApp from "@/stores/app";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

export default function SettingsScreen() {
  const router = useRouter();
  const locale = useApp.use.locale();
  const setLocale = useApp.use.setLocale();
  return (
    <SafeAreaView>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Box className="px-6 mt-6 mb-4">
          <HStack className="items-center">
            <FadeOutScaleDown onPress={() => router.back()}>
              <ArrowLeft size={24} color="white" />
            </FadeOutScaleDown>
            <Heading className="text-white ml-4" size="xl">
              Settings
            </Heading>
          </HStack>
          <VStack className=" my-6">
            <FormControl isReadOnly className="mb-6">
              <FormControlLabel>
                <FormControlLabelText className="text-primary-50">
                  Navidrome URL
                </FormControlLabelText>
              </FormControlLabel>
              <Input className="my-1">
                <InputField
                  className="placeholder:text-primary-50 text-white"
                  type="text"
                  readOnly
                  placeholder="Navidrome URL"
                  value={process.env.EXPO_PUBLIC_NAVIDROME_URL || ""}
                />
              </Input>
              <FormControlHelper>
                <FormControlHelperText className="text-primary-100">
                  Read only
                </FormControlHelperText>
              </FormControlHelper>
            </FormControl>
            <FormControl isReadOnly className="mb-6">
              <FormControlLabel>
                <FormControlLabelText className="text-primary-50">
                  Navidrome username
                </FormControlLabelText>
              </FormControlLabel>
              <Input className="my-1">
                <InputField
                  className="placeholder:text-primary-50 text-white"
                  type="text"
                  readOnly
                  placeholder="Navidrome username"
                  value={process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || ""}
                />
              </Input>
              <FormControlHelper>
                <FormControlHelperText className="text-primary-100">
                  Read only
                </FormControlHelperText>
              </FormControlHelper>
            </FormControl>
            <FormControl isReadOnly className="mb-6">
              <FormControlLabel>
                <FormControlLabelText className="text-primary-50">
                  Navidrome password
                </FormControlLabelText>
              </FormControlLabel>
              <Input className="my-1">
                <InputField
                  className="placeholder:text-primary-50 text-white"
                  type="text"
                  readOnly
                  placeholder="Navidrome password"
                  value={process.env.EXPO_PUBLIC_NAVIDROME_PASSWORD || ""}
                />
              </Input>
              <FormControlHelper>
                <FormControlHelperText className="text-primary-100">
                  Read only
                </FormControlHelperText>
              </FormControlHelper>
            </FormControl>
            <FormControl isReadOnly className="mb-6">
              <FormControlLabel>
                <FormControlLabelText className="text-primary-50">
                  Navidrome URL
                </FormControlLabelText>
              </FormControlLabel>

              <Input className="my-1">
                <InputField
                  className="placeholder:text-primary-50 text-white"
                  type="text"
                  readOnly
                  placeholder="Navidrome URL"
                  value={process.env.EXPO_PUBLIC_NAVIDROME_URL || ""}
                />
              </Input>
              <FormControlHelper>
                <FormControlHelperText className="text-primary-100">
                  Read only
                </FormControlHelperText>
              </FormControlHelper>
            </FormControl>
            <FormControl isReadOnly className="mb-6">
              <FormControlLabel>
                <FormControlLabelText className="text-primary-50">
                  Navidrome OpenSubsonic API version
                </FormControlLabelText>
              </FormControlLabel>
              <Input className="my-1">
                <InputField
                  className="placeholder:text-primary-50 text-white"
                  type="text"
                  readOnly
                  placeholder="Navidrome OpenSubsonic API version"
                  value={
                    process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || ""
                  }
                />
              </Input>
              <FormControlHelper>
                <FormControlHelperText className="text-primary-100">
                  Read only
                </FormControlHelperText>
              </FormControlHelper>
            </FormControl>
            <FormControl isReadOnly>
              <FormControlLabel>
                <FormControlLabelText className="text-primary-50">
                  Navidrome client
                </FormControlLabelText>
              </FormControlLabel>
              <Input className="my-1">
                <InputField
                  className="placeholder:text-primary-50 text-white"
                  type="text"
                  readOnly
                  placeholder="Navidrome client"
                  value={process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || ""}
                />
              </Input>
              <FormControlHelper>
                <FormControlHelperText className="text-primary-100">
                  Read only
                </FormControlHelperText>
              </FormControlHelper>
            </FormControl>
          </VStack>
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}
