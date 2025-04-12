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
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import {
  usePlaylist,
  useUpdatePlaylist,
} from "@/hooks/openSubsonic/usePlaylists";
import type { Child } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { FlashList } from "@shopify/flash-list";
import { useForm } from "@tanstack/react-form";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
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
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const [order, setOrder] = useState<Child[]>([]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = usePlaylist(id);
  const doUpdatePlaylist = useUpdatePlaylist();
  const cover = useGetCoverArt(
    data?.playlist.coverArt,
    { size: 400 },
    !!data?.playlist.coverArt,
  );
  const form = useForm({
    defaultValues: {
      name: data?.playlist.name ?? "",
      description: data?.playlist?.comment ?? "",
    },
    onSubmit: async ({ value }) => {
      console.log(value);
      doUpdatePlaylist.mutate(
        { id, ...value },
        {
          onSuccess: () => {
            router.navigate(`/playlists/${id}`);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastDescription>
                    Playlist successfully updated
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
                    An error occurred while updating the playlist
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
  });
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
    beginDrag: () => void,
  ) => {
    return (
      <PlaylistEditSongListItem
        item={item}
        beginDrag={beginDrag}
        isActive={isActive}
      />
    );
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
    }
  }, [data]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <FadeOutScaleDown
          onPress={form.state.isDirty ? form.handleSubmit : undefined}
        >
          <Text
            className={cn("text-emerald-500 font-bold text-lg", {
              "opacity-75": !form.state.isDirty,
            })}
          >
            Save
          </Text>
        </FadeOutScaleDown>
      ),
    });
  }, [form.state.isDirty]);

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} className="h-full flex-1">
      <FlashDragList
        data={order}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        itemsSize={70}
        onSort={handleListSort}
        ListHeaderComponent={
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
            <form.Field name="name">
              {(field) => (
                <Input className="border-white my-6 h-16" variant="underlined">
                  <InputField
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    className="text-3xl text-white text-center font-bold"
                    placeholder="Enter playlist name"
                  />
                </Input>
              )}
            </form.Field>
            <form.Field name="description">
              {(field) => (
                <Textarea className="border-0 border-b border-b-white my-6 text-white">
                  <TextareaInput
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    className="text-md font-normal color-white"
                    placeholder="Describe your playlist"
                  />
                </Textarea>
              )}
            </form.Field>
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
        }
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
