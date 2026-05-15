import Jellyfin from "@/assets/images/jellyfin.svg";
import Navidrome from "@/assets/images/navidrome.svg";
import OpenSubsonic from "@/assets/images/opensubsonic.svg";
import type { ServerType } from "@/stores/servers";

interface ServerTypeIconProps {
  type: ServerType;
  size?: number;
}

export default function ServerTypeIcon({
  type,
  size = 24,
}: ServerTypeIconProps) {
  switch (type) {
    case "jellyfin":
      return <Jellyfin width={size} height={size} />;
    case "opensubsonic":
      return <OpenSubsonic width={size} height={size} fill="white" />;
    default:
      return <Navidrome width={size} height={size} />;
  }
}
