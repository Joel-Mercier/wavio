import AddBottomSheet from "@/components/AddBottomSheet";
import DrawerMenu from "@/components/DrawerMenu";
import { Pressable } from "@/components/ui/pressable";
import { themeConfig } from "@/config/theme";
import useApp from "@/stores/app";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { Home, Library, Plus, Search } from "lucide-react-native";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

export default function TabLayout() {
  const { t } = useTranslation();
  const showDrawer = useApp.use.showDrawer();
  const setShowDrawer = useApp.use.setShowDrawer();
  const showAddTab = useApp.use.showAddTab();
  const [showAddSheet, setShowAddSheet] = useState(false);

  const handleClose = () => {
    setShowDrawer(false);
  };

  const handleAddTabPress = () => {
    setShowAddSheet(true);
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
          },
          tabBarButton: (props) => (
            <Pressable {...props} android_ripple={{ color: "transparent" }} />
          ),
          tabBarBackground: () => (
            <LinearGradient
              colors={[
                "rgba(24,23,25, 0)",
                "rgba(24,23,25, 0.3)",
                "rgba(24,23,25, 0.9)",
                "rgb(24,23,25)",
              ]}
              style={{ height: "100%" }}
              locations={[0, 0.1, 0.5, 1]}
            />
          ),
          tabBarActiveTintColor: themeConfig.theme.colors.emerald[500],
          tabBarInactiveTintColor: themeConfig.theme.colors.gray[200],
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
            // @ts-ignore
            href: showAddTab ? "" : null,
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
      <AddBottomSheet
        isOpen={showAddSheet}
        onClose={() => setShowAddSheet(false)}
      />
    </>
  );
}
