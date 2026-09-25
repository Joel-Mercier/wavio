import { useCollectionDownloadedCount } from "@/hooks/offline/useCollectionDownload";

// Rendered inside a Text so the running count re-renders alone while a
// collection drains, instead of its whole detail screen.
export default function CollectionDownloadedCount({
  trackedIds,
}: {
  trackedIds: string[] | undefined;
}) {
  return <>{useCollectionDownloadedCount(trackedIds)}</>;
}
