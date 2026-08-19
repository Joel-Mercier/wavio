import usePodcasts, { type PodcastProgressEntry } from "@/stores/podcasts";

// The progress entry for one episode, or undefined when it has none (which is
// also how "finished" is represented — finishing removes the entry). Selecting a
// single entry rather than the array keeps a listening episode's ~1-per-10s
// write from re-rendering every row on the screen.
export default function usePodcastProgress(
  id: string | undefined,
): PodcastProgressEntry | undefined {
  return usePodcasts((state) =>
    id ? state.podcastProgress.find((entry) => entry.id === id) : undefined,
  );
}
