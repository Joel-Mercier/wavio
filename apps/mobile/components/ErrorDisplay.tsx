import { Link } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import CircleX from "lucide-react-native/dist/esm/icons/circle-x.mjs";
import { Alert, AlertIcon, AlertText } from "@/components/ui/alert";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Center } from "@/components/ui/center";
import type { OpenSubsonicErrorResponse } from "@/services/openSubsonic";

export default function ErrorDisplay({
  error,
}: {
  error: OpenSubsonicErrorResponse | Error;
}) {
  const route = useRoute();
  const code = "code" in error ? error.code : undefined;
  return (
    <Box className="flex-1 items-center justify-center self-center content-center">
      <Alert
        action="muted"
        variant="outline"
        className="px-6 bg-transparent border-0 flex-col"
      >
        <AlertIcon as={CircleX} />
        <AlertText className="text-primary-50">{error.message}</AlertText>
        {code !== undefined && (
          <AlertText className="text-xs text-primary-100">
            Error code : {code}
          </AlertText>
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
