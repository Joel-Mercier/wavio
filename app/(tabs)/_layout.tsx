import FloatingPlayer from "@/components/FloatingPlayer";
import { Pressable } from "@/components/ui/pressable";
import { themeConfig } from "@/config/theme";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { Home, Library, Search } from "lucide-react-native";
import React from "react";

export default function TabLayout() {
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
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ focused, color }) => (
              <Home color={color} size={24} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ focused, color }) => (
              <Search color={color} size={24} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: "Library",
            tabBarIcon: ({ focused, color }) => (
              <Library color={color} size={24} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
