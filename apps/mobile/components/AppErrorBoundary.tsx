import { router } from "expo-router";
import TriangleAlert from "lucide-react-native/dist/esm/icons/triangle-alert.mjs";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { reportError } from "@/services/errorReporting";

type Variant = "fullscreen" | "inline";

interface Props {
  children: ReactNode;
  variant?: Variant;
}

interface State {
  hasError: boolean;
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const goHome = () => {
    try {
      router.replace("/(app)/(tabs)/(home)");
    } catch {
      // Navigator may be gone at the app level; retry re-mounts the tree.
    }
    onRetry();
  };
  return (
    <Box className="flex-1 items-center justify-center px-6 bg-primary-800">
      <VStack className="items-center gap-y-4 max-w-sm">
        <Icon as={TriangleAlert} className="text-primary-300 w-12 h-12" />
        <Heading className="text-white text-center" size="lg">
          {t("app.shared.errorBoundary.title")}
        </Heading>
        <Text className="text-primary-100 text-center">
          {t("app.shared.errorBoundary.message")}
        </Text>
        <VStack className="items-center gap-y-3 mt-4 w-full">
          <FadeOutScaleDown
            onPress={onRetry}
            className="rounded-full bg-white px-8 py-3"
          >
            <Text className="text-black font-bold">
              {t("app.shared.errorBoundary.retry")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown onPress={goHome} className="px-8 py-3">
            <Text className="text-primary-100 font-bold">
              {t("app.shared.errorBoundary.home")}
            </Text>
          </FadeOutScaleDown>
        </VStack>
      </VStack>
    </Box>
  );
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, {
      area: "ui",
      endpoint: this.props.variant ?? "fullscreen",
      extra: { componentStack: info.componentStack },
    });
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
