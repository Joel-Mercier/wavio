import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import Home from "lucide-react-native/dist/esm/icons/house.mjs";
import Library from "lucide-react-native/dist/esm/icons/library.mjs";
import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import type React from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { useCSSVariable } from "uniwind";
import AddBottomSheet from "@/components/AddBottomSheet";
import DrawerMenu from "@/components/DrawerMenu";
import useApp from "@/stores/app";

export default function TabLayout() {
  const { t } = useTranslation();
  const showDrawer = useApp((store) => store.showDrawer);
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const showAddTab = useApp((store) => store.showAddTab);
  const addBottomSheetRef = useRef<BottomSheetModal>(null);
  const emerald = useCSSVariable("--color-emerald-500") as string | undefined;
  const gray = useCSSVariable("--color-gray-200") as string | undefined;

  const handleClose = () => {
    setShowDrawer(false);
  };

  const handleAddTabPress = () => {
    addBottomSheetRef.current?.present();
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarLabelStyle: {
            fontFamily: "Inter_700Bold",
          },
          tabBarStyle: {
            position: "absolute",
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            // backgroundColor: "transparent",
          },
          tabBarButton: (props) => (
            <Pressable
              {...(props as React.ComponentProps<typeof Pressable>)}
              android_ripple={{ color: "transparent" }}
            />
          ),
          tabBarBackground: () => (
            <LinearGradient
              colors={[
                "rgba(0,0,0, 0)",
                "rgba(0,0,0, 0.4)",
                "rgba(0,0,0, 0.6)",
                "rgba(0,0,0, 0.85)",
                "rgb(0,0,0, 0.9)",
              ]}
              style={{ height: "100%" }}
              locations={[0, 0.1, 0.2, 0.5, 1]}
            />
          ),
          tabBarActiveTintColor: emerald,
          tabBarInactiveTintColor: gray,
        }}
      >
        <Tabs.Screen
          name="(home)"
          options={{
            title: t("app.home.tabTitle"),
            tabBarIcon: ({ focused, color }) => (
              <Home color={color} size={24} />
            ),
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.reset({
                index: 0,
                routes: [{ name: "(home)" }],
              });
            },
          })}
        />
        <Tabs.Screen
          name="(search)"
          options={{
            title: t("app.search.title"),
            tabBarIcon: ({ focused, color }) => (
              <Search color={color} size={24} />
            ),
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.reset({
                index: 0,
                routes: [{ name: "(search)" }],
              });
            },
          })}
        />
        <Tabs.Screen
          name="(library)"
          options={{
            title: t("app.library.title"),
            tabBarIcon: ({ focused, color }) => (
              <Library color={color} size={24} />
            ),
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.reset({
                index: 0,
                routes: [{ name: "(library)" }],
              });
            },
          })}
        />
        <Tabs.Screen
          name="add"
          options={{
            href: (showAddTab ? "" : null) as never,
            title: t("app.create.title"),
            tabBarIcon: ({ color }) => <Plus size={24} color={color} />,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              handleAddTabPress();
            },
          }}
        />
      </Tabs>
      <DrawerMenu onClose={handleClose} showDrawer={showDrawer} />
      <AddBottomSheet ref={addBottomSheetRef} />
    </>
  );
}
