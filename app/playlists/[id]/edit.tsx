import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FlashDragList from "@/components/FlashDragList";
import PlaylistEditSongListItem from "@/components/playlists/PlaylistEditSongListItem";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Input, InputField } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Text } from "@/components/ui/text";
import { Textarea, TextareaInput } from "@/components/ui/textarea";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import { usePlaylist } from "@/hooks/openSubsonic/usePlaylists";
import type { Child } from "@/services/openSubsonic/types";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { ListMusic } from "lucide-react-native";
import { useEffect, useLayoutEffect, useState } from "react";
import { TouchableOpacity } from "react-native";
import { Pressable } from "react-native-gesture-handler";

interface Item {
  title: string;
  color: string;
}

const NUM_ITEMS = 200;
const ITEM_HEIGHT = 60;

export default function EditPlaylistScreen() {
  const navigation = useNavigation();
  const [order, setOrder] = useState<Child[]>([]);
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = usePlaylist(id);
  const cover = useGetCoverArt(
    data?.playlist.coverArt,
    { size: 400 },
    !!data?.playlist.coverArt,
  );
  // const [order, setOrder] = useState(() => {
  //   return new Array(NUM_ITEMS).fill("").map((_, i) => {
  //     const colors = ["#493548", "#4B4E6D", "#6A8D92", "#80B192", "#A1E887"];
  //     return {
  //       title: `Item ${i}`,
  //       color: colors[Math.round(i % colors.length)],
  //     };
  //   }) as Array<Item>;
  // });

  // const onSort = (fromIndex: number, toIndex: number) => {
  //   const copy = [...order];
  //   const removed = copy.splice(fromIndex, 1);
  //   copy.splice(toIndex, 0, removed[0]!);
  //   setOrder(copy);
  // };

  // const renderItem = (
  //   item: Item,
  //   index: number,
  //   isActive: boolean,
  //   beginDrag: () => any,
  // ) => {
  //   return (
  //     <TouchableOpacity
  //       onLongPress={beginDrag}
  //       activeOpacity={0.9}
  //       style={{
  //         width: "100%",
  //         height: ITEM_HEIGHT,
  //         alignItems: "flex-start",
  //         justifyContent: "center",
  //         paddingHorizontal: "10%",
  //         backgroundColor: item.color,
  //       }}
  //     >
  //       <Text
  //         style={{
  //           color: "white",
  //           fontWeight: "bold",
  //         }}
  //         key={index}
  //       >
  //         {item.title}
  //         {isActive ? " (active)" : ""}
  //       </Text>
  //     </TouchableOpacity>
  //   );
  // };

  const renderItem = (
    item: Child,
    index: number,
    isActive: boolean,
    beginDrag: () => any,
  ) => {
    return (
      <PlaylistEditSongListItem
        item={item}
        beginDrag={beginDrag}
        isActive={isActive}
      />
    );
  };

  const handleNameChange = (text: string) => {
    setName(text);
  };

  const handleDescriptionChange = (text: string) => {
    setDescription(text);
  };

  const handleListSort = (fromIndex: number, toIndex: number) => {
    const copy = [...order];
    const removed = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, removed[0]!);
    setOrder(copy);
  };

  useEffect(() => {
    if (data?.playlist) {
      setOrder(data?.playlist.entry || []);
      setName(data?.playlist.name);
      setDescription(data?.playlist?.comment || "");
    }
  }, [data]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <FadeOutScaleDown onPress={() => navigation.goBack()}>
          <Text className="text-emerald-500 opacity-75 font-bold text-lg">
            Save
          </Text>
        </FadeOutScaleDown>
      ),
    });
  }, []);

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} className="h-full flex-1">
      <FlashDragList
        data={order}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        itemsSize={70}
        onSort={handleListSort}
        ListHeaderComponent={() => (
          <VStack className="px-6">
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
                className="text-3xl text-white text-center font-bold"
                placeholder="Enter playlist name"
              />
            </Input>
            <Textarea className="border-0 border-b border-b-white my-6">
              <TextareaInput
                value={description}
                onChangeText={handleDescriptionChange}
                className="text-md color-primary-100 font-normal"
                placeholder="Describe your playlist"
              />
            </Textarea>
            {/* <Input
              className="border-white my-6 h-16 active:border-white focus:border-white"
              variant="underlined"
            >
              <InputField
                defaultValue={description}
                onChangeText={handleDescriptionChange}
                className="text-xl text-white text-center font-normal"
                placeholder="Describe your playlist"
              />
            </Input> */}
          </VStack>
        )}
      />
    </SafeAreaView>
    // <FlashDragList
    //   data={order}
    //   renderItem={renderItem}
    //   itemsSize={ITEM_HEIGHT}
    //   onSort={onSort}
    //   ListHeaderComponent={() => (
    //     <VStack className="px-6">
    //       <HStack className="items-center justify-center">
    //         {cover.data ? (
    //           <Image
    //             source={{ uri: `data:image/jpeg;base64,${cover.data}` }}
    //             className="w-[50%] aspect-square rounded-md"
    //             alt="Playlist cover"
    //           />
    //         ) : (
    //           <Box className="w-[50%] aspect-square rounded-md bg-primary-600 items-center justify-center">
    //             <ListMusic size={48} color={themeConfig.theme.colors.white} />
    //           </Box>
    //         )}
    //       </HStack>
    //       <Input className="border-white my-6 h-16" variant="underlined">
    //         <InputField
    //           defaultValue={name}
    //           onChangeText={handleNameChange}
    //           className="text-3xl text-white text-center font-bold"
    //           placeholder="Enter playlist name"
    //         />
    //       </Input>
    //       <Input
    //         className="border-white my-6 h-16 active:border-white focus:border-white"
    //         variant="underlined"
    //       >
    //         <InputField
    //           defaultValue={description}
    //           onChangeText={handleDescriptionChange}
    //           className="text-xl text-white text-center font-normal"
    //           placeholder="Describe your playlist"
    //         />
    //       </Input>
    //     </VStack>
    //   )}
    // />
  );
}
