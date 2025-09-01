import AddBottomSheet from "@/components/AddBottomSheet";
import HomeDrawer from "@/components/home/HomeDrawer";
import { Pressable } from "@/components/ui/pressable";
import { themeConfig } from "@/config/theme";
import useApp from "@/stores/app";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { Home, Library, Plus, Search } from "lucide-react-native";
import React, { useState } from "react";

export default function TabLayout() {
  const showDrawer = useApp.use.showDrawer();
  const setShowDrawer = useApp.use.setShowDrawer();
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
              colors={["transparent", "rgba(24,23,25, 0.8)"]}
              style={{ height: 52 }}
              locations={[0, 0.3, 1]}
            />
          ),
          tabBarActiveTintColor: themeConfig.theme.colors.emerald[500],
        }}
      >
        <Tabs.Screen
          name="(home)"
          options={{
            title: "Home",
            tabBarIcon: ({ focused, color }) => (
              <Home color={color} size={24} />
            ),
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Prevent default behavior
              e.preventDefault();
              // Reset the home stack to its initial screen
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
            title: "Search",
            tabBarIcon: ({ focused, color }) => (
              <Search color={color} size={24} />
            ),
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Prevent default behavior
              e.preventDefault();
              // Reset the search stack to its initial screen
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
            title: "Library",
            tabBarIcon: ({ focused, color }) => (
              <Library color={color} size={24} />
            ),
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Prevent default behavior
              e.preventDefault();
              // Reset the library stack to its initial screen
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
            title: "Create",
            tabBarIcon: ({ color }) => <Plus size={24} color={color} />,
          }}
          listeners={{
            tabPress: (e) => {
              // Prevent default behavior and show bottom sheet instead
              e.preventDefault();
              handleAddTabPress();
            },
          }}
        />
      </Tabs>
      <HomeDrawer onClose={handleClose} showDrawer={showDrawer} />
      <AddBottomSheet
        isOpen={showAddSheet}
        onClose={() => setShowAddSheet(false)}
      />
    </>
  );
}
