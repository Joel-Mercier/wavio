import GripVertical from "lucide-react-native/dist/esm/icons/grip-vertical.mjs";
import { Uniwind } from "uniwind";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { cn } from "@/utils/tailwind";

interface QueueEditLaneDividerProps {
  label: string;
  isActive: boolean;
  height: number;
}

// The boundary between the manual lane and the context, rendered as a row so
// it takes part in the drag: tracks cross it to change lanes, and it can be
// dragged itself.
export default function QueueEditLaneDivider({
  label,
  isActive,
  height,
}: QueueEditLaneDividerProps) {
  const [gray400] = Uniwind.getCSSVariable(["--color-gray-400"]) as string[];
  return (
    <Box
      className={cn("flex-row items-end justify-between pb-2", {
        "bg-primary-600": isActive,
      })}
      style={{ height }}
    >
      <Heading
        size="sm"
        className="text-gray-300 flex-1 mr-2"
        numberOfLines={1}
      >
        {label}
      </Heading>
      <GripVertical size={18} color={gray400} />
    </Box>
  );
}
