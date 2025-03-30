import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Input, InputField } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import { usePlaylist } from "@/hooks/openSubsonic/usePlaylists";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams } from "expo-router";
import { ListMusic } from "lucide-react-native";
import { useEffect, useState } from "react";

export default function EditPlaylistScreen() {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = usePlaylist(id);
  const cover = useGetCoverArt(
    data?.playlist.coverArt,
    { size: 400 },
    !!data?.playlist.coverArt,
  );

  const handleNameChange = (text: string) => {
    setName(text);
  };

  const handleDescriptionChange = (text: string) => {
    setDescription(text);
  };

  useEffect(() => {
    if (data?.playlist) {
      setName(data?.playlist.name);
      setDescription(data?.playlist?.comment || "");
    }
  }, [data]);

  return (
    <SafeAreaView className="h-full">
      <FlashList
        data={data?.playlist.entry}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PlaylistEditSongListItem item={item} />}
        ListHeaderComponent={() => (
          <VStack>
            <HStack className="items-center justify-center">
              {cover.data ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${cover.data}` }}
                  className="w-[50%] aspect-square rounded-md"
                  alt="Playlist cover"
                />
              ) : (
                <Box className="w-[50%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                  <ListMusic size={48} color={themeConfig.theme.colors.white} />
                </Box>
              )}
            </HStack>
            <Input className="border-white my-6 h-16" variant="underlined">
              <InputField
                defaultValue={name}
                onChangeText={handleNameChange}
                autoFocus
                className="text-3xl text-white text-center font-bold"
                placeholder="My awesome playlist"
              />
            </Input>
            <Input className="border-white my-6 h-16" variant="underlined">
              <InputField
                defaultValue={description}
                onChangeText={handleDescriptionChange}
                autoFocus
                className="text-3xl text-white text-center font-bold"
                placeholder="Describe your playlist"
              />
            </Input>
          </VStack>
        )}
      />
    </SafeAreaView>
  );
}
