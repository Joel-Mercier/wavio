import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import { Uniwind } from "uniwind";
import { Box } from "@/components/ui/box";
import { cn } from "@/utils/tailwind";

interface DownloadedBadgeProps {
  // Diameter of the badge in px. Defaults to the 16px (size-4) list variant.
  size?: number;
  className?: string;
}

// Green circle with a down arrow, shown wherever an item is present in Wavio's
// offline downloads (tracks, album/playlist list items, detail headers). Shows
// regardless of the offline-mode toggle — it reflects on-disk downloads only.
export default function DownloadedBadge({
  size = 16,
  className,
}: DownloadedBadgeProps) {
  const [black] = Uniwind.getCSSVariable(["--color-black"]) as string[];
  return (
    <Box
      className={cn(
        "flex items-center justify-center rounded-full bg-emerald-500",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <ArrowDown color={black} size={size * 0.75} />
    </Box>
  );
}
