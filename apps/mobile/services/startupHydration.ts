import { getLocales } from "expo-localization";
import i18n, {
  applyZodLocale,
  SupportedLanguages,
  type TSupportedLanguages,
} from "@/config/i18n";
import { runStorageScopeMigration } from "@/services/storageScopeMigration";
import useApp from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";

// Startup work that app/_layout.tsx and app/(app)/_layout.tsx normally own, in a
// form a headless boot can run too. Android Auto binds the media service without
// ever starting an Activity, so nothing under app/ mounts: the locale stays "en"
// and every scoped store (they are all `skipHydration`) still holds its defaults
// — an empty queue for a car "play" to resume, no recent plays to build the
// tree's radio nodes from, and no downloads to resolve offline file paths.
// services/carAuto/session.ts runs this before it answers the car.

export function resolveDeviceLocale(): TSupportedLanguages {
  const userLocales = getLocales();
  const matching = userLocales.find(
    (userLocale) =>
      userLocale.languageCode &&
      (SupportedLanguages as string[]).includes(userLocale.languageCode),
  );
  // SupportedLanguages only holds the region-qualified "zh-CN", so a device
  // reporting a bare "zh" (or "zh-Hans", "zh-TW", …) never matches above and
  // would wrongly fall back to English. Map any Chinese base code to zh-CN.
  const zhMatch = userLocales.find((userLocale) =>
    userLocale.languageCode?.toLowerCase().startsWith("zh"),
  );
  return (matching?.languageCode ??
    (zhMatch ? "zh-CN" : "en")) as TSupportedLanguages;
}

// The saved locale is passed in so the React caller can key an effect off it;
// the headless boot reads it from the store itself.
export function applyStartupLocale(
  locale: TSupportedLanguages | null = useApp.getState().locale,
) {
  if (locale) {
    i18n.changeLanguage(locale);
    applyZodLocale(locale);
    return;
  }
  // setLocale applies the locale to i18n and zod itself.
  useApp.getState().setLocale(resolveDeviceLocale());
}

let scopedHydration: Promise<void> | null = null;

// Restores the scoped stores playback depends on. Only ever awaited before the
// car session goes live, which is well before app/(app)/_layout.tsx can mount,
// so this never re-reads storage over live in-memory state.
export function hydratePlaybackStores(): Promise<void> {
  // Must beat the rehydrates below for the same reason app/_layout.tsx runs it
  // at module scope: hydrating a scoped store before its legacy URL-keyed bucket
  // has been renamed reads an empty bucket and then persists that emptiness over
  // the real data. Sentinel-guarded, so the layout's call stays a no-op.
  runStorageScopeMigration();
  if (!useAuthBase.getState().isAuthenticated) return Promise.resolve();
  scopedHydration ??= Promise.all([
    Promise.resolve(useRecentPlays.persist.rehydrate()),
    Promise.resolve(useOffline.persist.rehydrate()),
    Promise.resolve(useQueue.persist.rehydrate()),
  ]).then(() => undefined);
  return scopedHydration;
}
