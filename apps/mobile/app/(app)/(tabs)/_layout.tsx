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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import AddBottomSheet from "@/components/AddBottomSheet";
import DrawerMenu from "@/components/DrawerMenu";
import OfflineBanner, {
  OFFLINE_BANNER_HEIGHT,
} from "@/components/OfflineBanner";
import { useIsOnline } from "@/hooks/useIsOnline";
import useApp from "@/stores/app";

// Approximate default react-navigation bottom tab content height (excluding the
// safe-area inset). Used to grow the bar so the offline banner fits beneath the
// icons inside the gradient.
const TAB_BAR_CONTENT_HEIGHT = 49;

export default function TabLayout() {
  const { t } = useTranslation();
  const showDrawer = useApp((store) => store.showDrawer);
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const showAddTab = useApp((store) => store.showAddTab);
  const addBottomSheetRef = useRef<BottomSheetModal>(null);
  const emerald = useCSSVariable("--color-emerald-500") as string | undefined;
  const gray = useCSSVariable("--color-gray-200") as string | undefined;
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();

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
            // While offline, grow the tab bar so the offline banner sits inside
            // the gradient just below the icons (icons stay put via paddingBottom).
            ...(isOnline
              ? {}
              : {
                  height:
                    TAB_BAR_CONTENT_HEIGHT +
                    insets.bottom +
                    OFFLINE_BANNER_HEIGHT,
                  paddingBottom: insets.bottom + OFFLINE_BANNER_HEIGHT,
                }),
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
            >
              <OfflineBanner />
            </LinearGradient>
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
