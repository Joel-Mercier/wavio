import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";
import { getActivePlayer } from "@/services/player";

const ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL =
  "android.media.action.DISPLAY_AUDIO_EFFECT_CONTROL_PANEL";
const EXTRA_AUDIO_SESSION = "android.media.extra.AUDIO_SESSION";
const EXTRA_PACKAGE_NAME = "android.media.extra.PACKAGE_NAME";
const EXTRA_CONTENT_TYPE = "android.media.extra.CONTENT_TYPE";
const CONTENT_TYPE_MUSIC = 0;

export function isEqualizerAvailable(): boolean {
  return Platform.OS === "android";
}

export async function openSystemEqualizer(packageName: string): Promise<void> {
  if (Platform.OS !== "android") return;
  const sessionId =
    (getActivePlayer() as unknown as { audioSessionId?: number })
      .audioSessionId ?? 0;
  await IntentLauncher.startActivityAsync(
    ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL,
    {
      extra: {
        [EXTRA_AUDIO_SESSION]: sessionId,
        [EXTRA_PACKAGE_NAME]: packageName,
        [EXTRA_CONTENT_TYPE]: CONTENT_TYPE_MUSIC,
      },
    },
  );
}
