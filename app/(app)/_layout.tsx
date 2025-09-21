import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { themeConfig } from "@/config/theme";
import useAuth from "@/stores/auth";
import { Redirect, Stack } from "expo-router";
import { ArrowLeft, X } from "lucide-react-native";

export default function AppLayout() {
  const isAuthenticated = useAuth.use.isAuthenticated();
  console.log("isAuthenticated", isAuthenticated);
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      {/* <Stack.Screen
                      name="albums/[id]/index"
                      options={{ headerShown: false }}
                    /> */}
      <Stack.Screen name="playlists/new" />
      <Stack.Screen
        name="playlists/add-to-playlist"
        options={({ navigation }) => ({
          headerShown: true,
          title: "Add to playlist",
          headerTitleAlign: "center",
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: "bold",
          },
          headerLeft: () => (
            <FadeOutScaleDown onPress={() => navigation.goBack()}>
              <ArrowLeft size={22} color={themeConfig.theme.colors.white} />
            </FadeOutScaleDown>
          ),
        })}
      />
      <Stack.Screen
        name="playlists/[id]/edit"
        options={({ navigation }) => ({
          headerShown: true,
          title: "Edit playlist",
          headerTitleAlign: "center",
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: "bold",
          },
          headerLeft: () => (
            <FadeOutScaleDown onPress={() => navigation.goBack()}>
              <X size={22} color={themeConfig.theme.colors.white} />
            </FadeOutScaleDown>
          ),
        })}
      />
      <Stack.Screen name="internet-radio-stations/new" />
      <Stack.Screen
        name="player"
        options={{
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          gestureDirection: "vertical",
          animationDuration: 300,
          animation: "fade_from_bottom",
          presentation: "formSheet",
        }}
      />
    </Stack>
  );
}
