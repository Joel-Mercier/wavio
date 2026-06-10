import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { startScan } from "@/services/local/mediaLibraryScanning";
import useLocalLibrary, { type ScanStatus } from "@/stores/localLibrary";

// Full-screen first-login gate for the local-library backend. Kicks off the
// on-device scan (services/local/indexer.ts) once the store is ready, and shows
// a spinner with the indexer's live step (reading files → extracting metadata →
// cleaning up). When the scan finishes, `setScanFinished` stamps `lastScanAt`,
// the gate in app/(app)/_layout.tsx closes and the app renders on Home.

// Zeroed result used to dismiss the gate when the user skips past a scan error.
const EMPTY_RESULT = {
  indexed: 0,
  skipped: 0,
  removed: 0,
  failed: 0,
  cancelled: false,
};

// Maps the indexer's phase to the i18n key for the step shown under the spinner.
const STEP_KEY: Record<ScanStatus["phase"], string> = {
  idle: "app.localIndexing.listing",
  listing: "app.localIndexing.listing",
  indexing: "app.localIndexing.indexing",
  pruning: "app.localIndexing.pruning",
  done: "app.localIndexing.finishing",
};

export default function LocalLibraryIndexing() {
  const { t } = useTranslation();
  const [emerald] = Uniwind.getCSSVariable(["--color-emerald-500"]) as string[];
  const ready = useLocalLibrary((s) => s.ready);
  const lastScanAt = useLocalLibrary((s) => s.lastScanAt);
  const status = useLocalLibrary((s) => s.status);

  // Start the scan once the store is hydrated and we've confirmed it's never
  // been scanned. Deps stay stable across the scan (lastScanAt only flips when
  // it finishes), so this fires exactly once; `startScan` also self-guards.
  useEffect(() => {
    if (ready && lastScanAt === undefined) {
      void startScan();
    }
  }, [ready, lastScanAt]);

  const retry = () => {
    useLocalLibrary.getState().setStatus({
      phase: "listing",
      processed: 0,
      total: 0,
    });
    void startScan();
  };

  const skip = () => {
    useLocalLibrary.getState().setScanFinished(EMPTY_RESULT);
  };

  return (
    <Box className="flex-1 bg-primary-800">
      <Center className="flex-1 px-8">
        {status.error ? (
          <VStack className="items-center gap-4 max-w-sm">
            <Heading className="text-white text-xl text-center">
              {t("app.localIndexing.errorTitle")}
            </Heading>
            <Text className="text-primary-100 text-sm text-center">
              {status.error}
            </Text>
            <FadeOutScaleDown
              onPress={retry}
              className="items-center justify-center px-6 py-3 rounded-md bg-emerald-500 mt-2"
            >
              <Text className="text-primary-800 font-bold">
                {t("app.localIndexing.retry")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={skip} className="px-6 py-2">
              <Text className="text-primary-100 font-medium">
                {t("app.localIndexing.continue")}
              </Text>
            </FadeOutScaleDown>
          </VStack>
        ) : (
          <VStack className="items-center gap-4">
            <Spinner size="large" color={emerald} />
            <Heading className="text-white text-xl text-center">
              {t("app.localIndexing.title")}
            </Heading>
            <Text className="text-primary-100 text-sm text-center">
              {t(STEP_KEY[status.phase])}
            </Text>
            {status.phase === "indexing" && status.total > 0 ? (
              <Text className="text-primary-300 text-xs">
                {t("app.localIndexing.countLabel", {
                  processed: status.processed,
                  total: status.total,
                })}
              </Text>
            ) : null}
            {status.currentFile ? (
              <Text
                numberOfLines={1}
                className="text-primary-400 text-xs max-w-xs"
              >
                {status.currentFile}
              </Text>
            ) : null}
          </VStack>
        )}
      </Center>
    </Box>
  );
}
