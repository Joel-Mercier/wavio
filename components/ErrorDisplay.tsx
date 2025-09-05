import { Alert, AlertIcon, AlertText } from "@/components/ui/alert";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Center } from "@/components/ui/center";
import type { OpenSubsonicErrorResponse } from "@/services/openSubsonic";
import { useRoute } from "@react-navigation/native";
import { Link } from "expo-router";
import { CircleX } from "lucide-react-native";

export default function ErrorDisplay({
  error,
}: { error: OpenSubsonicErrorResponse }) {
  const route = useRoute();
  return (
    <Box className="flex-1 items-center justify-center self-center content-center">
      <Alert
        action="muted"
        variant="outline"
        className="px-6 bg-transparent border-0 flex-col"
      >
        <AlertIcon as={CircleX} />
        <AlertText className="text-primary-50">{error.message}</AlertText>
        <AlertText className="text-xs text-primary-100">
          Error code : {error.code}
        </AlertText>
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
