import axios, { type AxiosRequestConfig } from "axios";
import { backgroundSleep } from "@/services/backgroundTimer";
import jellyfinApiInstance, {
  type JellyfinRequestFlags,
} from "@/services/jellyfin/index";
import { useAuthBase } from "@/stores/auth";

const flags = (
  value: AxiosRequestConfig & JellyfinRequestFlags,
): AxiosRequestConfig => value;

/**
 * Whether this user may delete the item. Jellyfin computes it per item from the
 * user's policy (deletion allowed everywhere, or only in some libraries) and
 * the item itself, so it is asked rather than derived from the policy here.
 */
export async function canDeleteItem(id: string): Promise<boolean> {
  const userId = useAuthBase.getState().jellyfinUserId ?? "";
  const rsp = await jellyfinApiInstance.get<{ CanDelete?: boolean }>(
    `/Users/${userId}/Items/${id}`,
    flags({ params: { Fields: "CanDelete" }, notFoundIsExpected: true }),
  );
  return rsp.data?.CanDelete === true;
}

/**
 * Deletes one track from the library and from disk.
 *
 * Only ever called with track ids: deleting an album item removes its folder
 * recursively, and with a flat folder layout that folder holds other albums.
 */
export async function deleteTrack(id: string): Promise<void> {
  try {
    await jellyfinApiInstance.delete(
      `/Items/${id}`,
      flags({
        notFoundIsExpected: true,
        refusalIsExpected: true,
        failureIsHandled: true,
      }),
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return;
    throw error;
  }
}

export const deleteConcurrency = (): number => 3;

type ScheduledTask = {
  Key?: string;
  State?: string;
  LastExecutionResult?: { EndTimeUtc?: string };
};

const SCAN_POLL_MS = 2000;
const SCAN_WAIT_MS = 120_000;

async function libraryScanEndTime(): Promise<string | undefined> {
  const rsp = await jellyfinApiInstance.get<ScheduledTask[]>(
    "/ScheduledTasks",
    flags({ refusalIsExpected: true }),
  );
  const task = rsp.data?.find((entry) => entry.Key === "RefreshLibrary");
  return task?.State === "Idle"
    ? (task.LastExecutionResult?.EndTimeUtc ?? "")
    : undefined;
}

/**
 * Jellyfin keeps an album whose last track was deleted, listed with no songs,
 * until a library scan finds its folder holds no audio. Only an administrator
 * may start one. Resolves true once that scan has finished.
 */
export async function refreshAfterDelete(
  emptiedAlbumIds: string[],
): Promise<boolean> {
  if (emptiedAlbumIds.length === 0 || !useAuthBase.getState().isAdmin) {
    return false;
  }
  const before = await libraryScanEndTime();
  await jellyfinApiInstance.post(
    "/Library/Refresh",
    undefined,
    flags({ refusalIsExpected: true }),
  );
  const deadline = Date.now() + SCAN_WAIT_MS;
  while (Date.now() < deadline) {
    await backgroundSleep(SCAN_POLL_MS);
    const end = await libraryScanEndTime();
    if (end !== undefined && end !== before) return true;
  }
  return false;
}
