import { Alert, AlertIcon, AlertText } from "@/components/ui/alert";
import { Box } from "@/components/ui/box";
import type { OpenSubsonicErrorResponse } from "@/services/openSubsonic";
import { Link } from "expo-router";
import { CircleX } from "lucide-react-native";
import { Button, ButtonText } from "./ui/button";
import { Center } from "./ui/center";

export default function ErrorDisplay({
  error,
}: { error: OpenSubsonicErrorResponse }) {
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
      <Center>
        <Link href={"/"} asChild>
          <Button action="primary" size="lg" className="mt-6">
            <ButtonText>Back to home</ButtonText>
          </Button>
        </Link>
      </Center>
    </Box>
  );
}
