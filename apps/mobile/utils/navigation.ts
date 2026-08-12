import type { useRouter } from "expo-router";

type AppRouter = ReturnType<typeof useRouter>;

export function goBackOrHome(router: AppRouter) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.navigate("/(app)/(tabs)/(home)");
  }
}

// A deep link that arrived while signed out. `(app)/_layout` bounces it to the
// login screen, and `(auth)/_layout` then redirects home once authenticated —
// which would drop the target the user actually asked for. Parking it here lets
// that redirect land on the intended screen instead.
let pendingHref: string | null = null;

export function setPendingHref(href: string) {
  pendingHref = href;
}

export function consumePendingHref() {
  const href = pendingHref;
  pendingHref = null;
  return href;
}
