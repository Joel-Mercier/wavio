import { useAuthBase } from "@/stores/auth";
import { setPendingHref } from "@/utils/navigation";

// Launcher shortcuts (plugins/withShortcuts.js) deep-link through a stable
// `wavio://shortcuts/<id>` URI rather than a route path, so moving a screen is a
// change here instead of a change to shortcuts.xml plus a prebuild. Two of these
// also have no unambiguous bare path: the (search) and (library) group indexes
// both resolve to "/", which collides with Home.
const SHORTCUT_HREFS: Record<string, string> = {
  search: "/recent-searches",
  library: "/(app)/(tabs)/(library)",
  queue: "/queue",
};

// Cold start hands us the whole URL ("wavio://shortcuts/queue"); a tap while the
// app is already running can hand us just the path.
const SHORTCUT_PATTERN = /(?:^|\/)shortcuts\/([a-z-]+)\/?$/;

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  const id = SHORTCUT_PATTERN.exec(path)?.[1];
  if (!id) return path;

  const href = SHORTCUT_HREFS[id];
  if (!href) return path;

  if (!useAuthBase.getState().isAuthenticated) setPendingHref(href);

  return href;
}
