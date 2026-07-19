import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { Uniwind } from "uniwind";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { cn } from "@/utils/tailwind";

export default function LidarrCover({
  url,
  size = 56,
  variant = "album",
  rounded = "rounded-md",
}: {
  url: string | undefined;
  size?: number;
  variant?: "album" | "artist";
  rounded?: string;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const Icon = variant === "artist" ? User : Disc3;
  const radius = variant === "artist" ? "rounded-full" : rounded;

  return (
    <ImageWithFallback
      source={{ uri: url }}
      style={{ width: size, height: size }}
      className={radius}
      alt=""
      fallback={
        <Box
          className={cn("bg-primary-600 items-center justify-center", radius)}
          style={{ width: size, height: size }}
        >
          <Icon size={size * 0.4} color={white} />
        </Box>
      }
    />
  );
}
