import type { Href, useRouter } from "expo-router";

type AppRouter = ReturnType<typeof useRouter>;

// The genre route param is the genre *name*, not an opaque id, so it has to
// survive two hazards. Interpolating it into a path string splits a name
// containing "/" ("Chill Out/Trip-Hop/Lounge" — issue #165) into extra segments
// and `genres/[id]` stops matching; the object href form encodes it into one
// segment instead. And expo-router decodes the segment *twice* — once in
// getStateFromPath, once in useLocalSearchParams — so pre-encoding here absorbs
// the second decode and a name carrying a literal percent escape
// ("Drum%20n%20Bass") reaches the screen intact. Names without "%" encode to
// themselves, so ordinary hrefs stay readable.
export function genreHref(genre: string): Href {
  return {
    pathname: "/genres/[id]",
    params: { id: encodeURIComponent(genre) },
  };
}

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
