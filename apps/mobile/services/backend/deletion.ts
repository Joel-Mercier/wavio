import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/deletion";
import * as L from "@/services/local/deletion";

// Permanent file deletion. Gated by `capabilities.fileDeletion`, so the
// Subsonic slot is never reached from the UI; it throws rather than pretending.
const unsupported = async (): Promise<never> => {
  throw new Error("This server can't delete files");
};

export const deleteTrack = dispatch<(id: string) => Promise<void>>(
  unsupported,
  J.deleteTrack,
  L.deleteTrack,
);

/** Whether this user may delete the item. Asked of the server where it decides. */
export const canDeleteItem = dispatch<(id: string) => Promise<boolean>>(
  async () => false,
  J.canDeleteItem,
  async () => true,
);

/** How many deletes to run at once. */
export const deleteConcurrency = dispatch<() => number>(
  () => 1,
  J.deleteConcurrency,
  L.deleteConcurrency,
);

/**
 * Lets the server drop albums the delete left empty. Resolves true when it did
 * something worth refetching for.
 */
export const refreshAfterDelete = dispatch<
  (emptiedAlbumIds: string[]) => Promise<boolean>
>(
  async () => false,
  J.refreshAfterDelete,
  async () => false,
);
