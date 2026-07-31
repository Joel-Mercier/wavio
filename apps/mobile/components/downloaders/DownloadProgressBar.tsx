import { Box } from "@/components/ui/box";

export default function DownloadProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <Box className="h-2 rounded-full bg-primary-500 overflow-hidden">
      <Box
        className="h-full bg-emerald-500 rounded-full"
        style={{ width: `${clamped}%` }}
      />
    </Box>
  );
}
