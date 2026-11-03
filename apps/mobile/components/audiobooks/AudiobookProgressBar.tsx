import { Box } from "@/components/ui/box";
import { cn } from "@/utils/tailwind";

export default function AudiobookProgressBar({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  if (percent <= 0) return null;
  return (
    <Box
      className={cn(
        "h-1 rounded-full bg-primary-500 overflow-hidden",
        className,
      )}
    >
      <Box className="h-1 bg-emerald-500" style={{ width: `${percent}%` }} />
    </Box>
  );
}
