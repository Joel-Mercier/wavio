import axios from "axios";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { authenticateWithFallback } from "@/services/auth/authenticate";
import { reportError, scrubUrl } from "@/services/errorReporting";
import { useAuthBase } from "@/stores/auth";
import { useServersBase } from "@/stores/servers";

// Blank spinner gate shown while silently re-authenticating into a saved server
// (see utils/switchServer.ts). Mirrors components/local/LocalLibraryIndexing.
// On success the auth store's login() flips isAuthenticated and (auth)/_layout
// redirects to Home; the (app) scope-change effect handles the store/cache
// rehydrate. On failure we surface a retry / manual-login fallback.
export default function SwitchingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [emerald] = Uniwind.getCSSVariable(["--color-emerald-500"]) as string[];
  const params = useLocalSearchParams<{
    serverId?: string;
    username?: string;
  }>();
  const [error, setError] = useState(false);
  const ranRef = useRef(false);

  const goToManualLogin = () => {
    const search = new URLSearchParams({
      ...(params.serverId ? { serverId: params.serverId } : {}),
      ...(params.username ? { username: params.username } : {}),
    });
    router.replace(`/(auth)/login?${search.toString()}` as never);
  };

  const authenticate = async () => {
    const server = params.serverId
      ? useServersBase.getState().getServerById(params.serverId)
      : undefined;
    const user = useServersBase
      .getState()
      .users.find(
        (u) => u.serverId === params.serverId && u.username === params.username,
      );
    if (!server || server.type === "local" || !user?.password) {
      goToManualLogin();
      return;
    }
    try {
      setError(false);
      const { options, activeUrl } = await authenticateWithFallback(
        server.type,
        server.url,
        server.fallbackUrl,
        user.username,
        user.password,
      );
      useAuthBase.getState().login({
        serverId: server.id,
        url: activeUrl,
        username: user.username,
        password: user.password,
        ...options,
      });
    } catch (err) {
      reportError(err, {
        area: "auth",
        endpoint: `${server.type} login`,
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
        extra: {
          serverType: server.type,
          url: scrubUrl(server.url),
          hasResponse: axios.isAxiosError(err) ? !!err.response : undefined,
        },
      });
      setError(true);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run exactly once on mount
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void authenticate();
  }, []);

  const retry = () => {
    void authenticate();
  };

  return (
    <Box className="flex-1 bg-primary-800">
      <Center className="flex-1 px-8">
        {error ? (
          <VStack className="items-center gap-4 max-w-sm">
            <Heading className="text-white text-xl text-center">
              {t("app.serverSwitch.errorTitle")}
            </Heading>
            <Text className="text-primary-100 text-sm text-center">
              {t("app.serverSwitch.errorDescription")}
            </Text>
            <FadeOutScaleDown
              onPress={retry}
              className="items-center justify-center px-6 py-3 rounded-md bg-emerald-500 mt-2"
            >
              <Text className="text-primary-800 font-bold">
                {t("app.serverSwitch.retry")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={goToManualLogin} className="px-6 py-2">
              <Text className="text-primary-100 font-medium">
                {t("app.serverSwitch.enterManually")}
              </Text>
            </FadeOutScaleDown>
          </VStack>
        ) : (
          <VStack className="items-center gap-4">
            <Spinner size="large" color={emerald} />
            <Heading className="text-white text-xl text-center">
              {t("app.serverSwitch.title")}
            </Heading>
            <Text className="text-primary-100 text-sm text-center">
              {t("app.serverSwitch.subtitle")}
            </Text>
          </VStack>
        )}
      </Center>
    </Box>
  );
}
