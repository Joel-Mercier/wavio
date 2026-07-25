import { Link } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import CircleX from "lucide-react-native/dist/esm/icons/circle-x.mjs";
import ServerOff from "lucide-react-native/dist/esm/icons/server-off.mjs";
import WifiOff from "lucide-react-native/dist/esm/icons/wifi-off.mjs";
import { useTranslation } from "react-i18next";
import { Alert, AlertIcon, AlertText } from "@/components/ui/alert";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Center } from "@/components/ui/center";
import { useIsDeviceOnline } from "@/hooks/useIsOnline";
import { isNetworkNoise } from "@/services/errorReporting";
import type { OpenSubsonicErrorResponse } from "@/services/openSubsonic";

export default function ErrorDisplay({
  error,
}: {
  error: OpenSubsonicErrorResponse | Error;
}) {
  const route = useRoute();
  const { t } = useTranslation();
  // Raw device connectivity, to choose the copy: the device being offline ("no
  // connection") vs the device being online but the server unreachable — a
  // gateway/origin 5xx or a socket error. Mirrors OfflineBanner.
  const isDeviceOnline = useIsDeviceOnline();
  // A gateway 502/503/504, an origin-error 5xx, or a socket-level failure means
  // the server is unreachable, not that the app hit a bug. Show the same
  // graceful offline state as the rest of the app instead of a raw axios
  // message like "Request failed with status code 502".
  const isUnreachable = isNetworkNoise(error);
  const code = "code" in error ? error.code : undefined;

  return (
    <Box className="flex-1 items-center justify-center self-center content-center">
      <Alert
        action="muted"
        variant="outline"
        className="px-6 bg-transparent border-0 flex-col"
      >
        {isUnreachable ? (
          <>
            <AlertIcon as={isDeviceOnline ? ServerOff : WifiOff} />
            <AlertText className="text-primary-50">
              {isDeviceOnline
                ? t("app.offlineBanner.serverUnreachable")
                : t("app.offlineBanner.noConnection")}
            </AlertText>
          </>
        ) : (
          <>
            <AlertIcon as={CircleX} />
            <AlertText className="text-primary-50">{error.message}</AlertText>
            {code !== undefined && (
              <AlertText className="text-xs text-primary-100">
                Error code : {code}
              </AlertText>
            )}
          </>
        )}
      </Alert>
      {route.name !== "index" && (
        <Center>
          <Link href={"/"} asChild>
            <Button action="primary" size="lg" className="mt-6 rounded-full">
              <ButtonText>Back to home</ButtonText>
            </Button>
          </Link>
        </Center>
      )}
    </Box>
  );
}
