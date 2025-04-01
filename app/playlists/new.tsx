import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useCreatePlaylist } from "@/hooks/openSubsonic/usePlaylists";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";

export default function NewPlaylistScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>("");
  const router = useRouter();
  const toast = useToast();
  const doCreatePlaylist = useCreatePlaylist();

  const handleCancelPress = () => {
    router.back();
  };

  const handleNameChange = (text: string) => {
    setName(text);
  };

  const handleCreatePress = () => {
    doCreatePlaylist.mutate(
      { name },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["playlists"] });
          router.navigate("/(tabs)/library");
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>
                  Playlist successfully created
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          console.error(error);
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastDescription>
                  An error occurred while creating the playlist
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  return (
    <LinearGradient
      colors={[themeConfig.theme.colors.gray[300], "transparent"]}
      className="h-full"
    >
      <SafeAreaView className="h-full justify-center">
        <VStack className="w-full px-6">
          <Center>
            <Heading className="text-white mb-6" size="xl">
              Give a name to your playlist
            </Heading>
          </Center>
          <Input className="border-white my-6 h-16" variant="underlined">
            <InputField
              defaultValue={name}
              onChangeText={handleNameChange}
              autoFocus
              className="text-3xl text-white text-center font-bold"
              placeholder="My awesome playlist"
            />
          </Input>
          <HStack className="mt-6 items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCancelPress}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleCreatePress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Create</Text>
            </FadeOutScaleDown>
          </HStack>
        </VStack>
      </SafeAreaView>
    </LinearGradient>
  );
}
