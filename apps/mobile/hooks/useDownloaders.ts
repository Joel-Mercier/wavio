import { type Href, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { openDownloaderPicker } from "@/components/downloaders/DownloaderPickerSheet";
import useLidarr from "@/stores/lidarr";
import useSoulSync from "@/stores/soulsync";

export type DownloaderId = "lidarr" | "soulsync";

export interface Downloader {
  id: DownloaderId;
  /** Brand name, deliberately not translated. */
  name: string;
  /** Where to look `query` up in this downloader, search pre-filled. */
  searchHref: (query: string) => Href;
}

// Order matters: it is the order downloaders are offered in, in the settings
// list and in the picker. Lidarr came first and stays first.
const DOWNLOADERS: Downloader[] = [
  {
    id: "lidarr",
    name: "Lidarr",
    searchHref: (query) => ({
      pathname: "/downloaders/discovery",
      params: { q: query },
    }),
  },
  {
    id: "soulsync",
    name: "SoulSync",
    searchHref: (query) => ({
      pathname: "/downloaders/soulsync/search",
      params: { q: query },
    }),
  },
];

// The single place that answers "which downloaders can this user actually add
// music through", so screens offering content the library doesn't hold never
// have to know a downloader by name.
export function useConnectedDownloaders(): Downloader[] {
  const isLidarrConnected = useLidarr((store) => store.isConnected);
  const isSoulSyncConnected = useSoulSync((store) => store.isConnected);

  return useMemo(() => {
    const isConnected: Record<DownloaderId, boolean> = {
      lidarr: isLidarrConnected,
      soulsync: isSoulSyncConnected,
    };
    return DOWNLOADERS.filter((downloader) => isConnected[downloader.id]);
  }, [isLidarrConnected, isSoulSyncConnected]);
}

// Sends a name off to be looked up. With one downloader connected there is
// nothing to decide, so it goes straight there; with several the user picks,
// since which one holds a given release is theirs to know, not ours to guess.
// With none, `canSearch` is false and callers stay inert rather than offering a
// dead end.
export function useDownloaderSearch() {
  const downloaders = useConnectedDownloaders();
  const router = useRouter();

  const searchFor = useCallback(
    (query: string) => {
      if (downloaders.length === 0) return;
      if (downloaders.length === 1) {
        router.navigate(downloaders[0].searchHref(query));
        return;
      }
      openDownloaderPicker(query);
    },
    [downloaders, router],
  );

  return { downloaders, canSearch: downloaders.length > 0, searchFor };
}
